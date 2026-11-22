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

const mergePatch = ({
  state, operation, index, patch,
}) => {
  if (patch === null ||
    typeof patch !== 'object' ||
    Array.isArray(patch)) {
    const name = operation.name || `operation-${index}`
    throw new TypeError(
      `Operation ${name} must return a non-null, non-array object`,
    )
  }

  return {...state, ...patch}
}

const operationName = (operation, index) =>
  operation.name || `operation-${index}`

// The step wrapper must report the original name, so errors and hooks agree.
const withName = (name, fn) =>
  Object.defineProperty(fn, 'name', {value: name})

const wrapStepStart = ({
  operation, index, total, onStepStart, sync,
}) => {
  const name = operationName(operation, index)
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
const wrapStepSuccess = ({onStepSuccess, total, sync}) =>
  merge => ({
    state, operation, index, patch,
  }) => {
    const merged = merge({
      state, operation, index, patch,
    })
    const context = {
      operation: operationName(operation, index),
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

  const total = operations.length

  const steps = onStepStart
    ? operations.map((operation, index) =>
      wrapStepStart({
        operation, index, total, onStepStart, sync,
      }))
    : operations

  const merge = onStepSuccess
    ? wrapStepSuccess({onStepSuccess, total, sync})(mergePatch)
    : mergePatch

  return {
    steps,
    scanner: scannerFor(merge),
    reduceOpts: reduceOptions({strategy, onError, onFailure}),
    assertInitial: initialState => assertEnrichState(initialState, label),
    finish: finishEnrich,
  }
}
