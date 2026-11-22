import {
  collect, normalizeFailure, normalizeOperationError,
} from './strategy.js'

const validateOperations = (operations, label) => {
  if (!Array.isArray(operations))
    throw new TypeError(`${label}() requires an array of operations`)

  for (const op of operations) {
    if (typeof op !== 'function') {
      throw new TypeError(
        `${label}() requires every operation to be a function`,
      )
    }
  }
}

const assertEnrichState = (initialState, label) => {
  if (initialState === null ||
    typeof initialState !== 'object' ||
    Array.isArray(initialState)) {
    throw new TypeError(
      `${label}() requires initialState to be a non-null, non-array object`,
    )
  }
}

const operationName = (operation, index) =>
  operation.name || `operation-${index}`

// Step names are computed once at build time and shared by the error messages
// and both hooks, so every consumer sees the same normalization.
const mergePatch = (names, {
  state, index, patch,
}) => {
  if (patch === null ||
    typeof patch !== 'object' ||
    Array.isArray(patch)) {
    throw new TypeError(
      `Operation ${names[index]} must return a non-null, ` +
      'non-array object',
    )
  }

  return {...state, ...patch}
}

// The step wrapper must report the original name, so errors and hooks agree.
const withName = (name, fn) =>
  Object.defineProperty(fn, 'name', {value: name})

const wrapStepStart = (name, {
  operation, index, total, onStepStart, sync,
}) => {
  const context = {operation: name, index, total}

  if (sync) {
    return withName(name, state => {
      onStepStart(context)
      return operation(state)
    })
  }

  return withName(name, async state => {
    await onStepStart(context)
    return operation(state)
  })
}

const notifySuccessSync = (onStepSuccess, context, merged) => {
  onStepSuccess(context)
  return merged
}

const notifySuccessAsync = (onStepSuccess, context, merged) =>
  Promise.resolve(onStepSuccess(context)).then(() => merged)

// Success fires only once the patch has been validated and merged.
const withStepSuccess = (merge, {
  names, onStepSuccess, total, sync,
}) =>
  ({
    state, index, patch,
  }) => {
    const merged = merge({state, index, patch})
    const context = {
      operation: names[index],
      patch,
      index,
      total,
    }

    return sync
      ? notifySuccessSync(onStepSuccess, context, merged)
      : notifySuccessAsync(onStepSuccess, context, merged)
  }

const reduceOptions = ({strategy, onError, onFailure}) => ({
  strategy,
  ...onError
    ? {onError: ctx => onError(normalizeOperationError(ctx))}
    : {},
  ...onFailure
    ? {onFailure: ctx => onFailure(normalizeFailure(ctx))}
    : {},
})

const finishEnrich = result => ({
  value: result.value,
  errors: result.errors.map(normalizeOperationError),
  failure: normalizeFailure(result.failure),
})

/**
 * Validate an enrichment pipeline and prepare what both `enrich` and
 * `enrichSync` need: the steps, the step scanner, the reduce options and the
 * result shaping.
 *
 * `scannerFor` is the only coloured part: each twin passes its own sync/async
 * scanner builder, everything else is shared. `sync` selects how the step hooks
 * are dispatched: awaited by `enrich`, fire-and-forget by `enrichSync`.
 *
 * @param {{
 *  operations: Array<(state) => object>,
 *  opts: {strategy?: StrategyFn, onError?, onFailure?, onStepStart?,
 *   onStepSuccess?},
 *  label: string,
 *  sync?: boolean,
 *  scannerFor: (merge: Function) => Function
 * }} params
 */
export const prepareEnrich = ({
  operations, opts, label, sync = false, scannerFor,
}) => {
  validateOperations(operations, label)

  if (opts.recover !== undefined)
    throw new TypeError(
      `${label} does not support recover; use reduce if fold recovery is ` +
      'needed',
    )

  const {
    strategy = collect, onError, onFailure, onStepStart, onStepSuccess,
  } = opts

  const names = operations.map(operationName)
  const total = names.length

  const steps = onStepStart
    ? operations.map((operation, index) =>
      wrapStepStart(names[index], {
        operation, index, total, onStepStart, sync,
      }))
    : operations

  const merge = step => mergePatch(names, step)

  return {
    steps,
    scanner: scannerFor(onStepSuccess
      ? withStepSuccess(merge, {
        names, onStepSuccess, total, sync,
      })
      : merge),
    reduceOpts: reduceOptions({strategy, onError, onFailure}),
    assertInitial: initialState => assertEnrichState(initialState, label),
    finish: finishEnrich,
  }
}
