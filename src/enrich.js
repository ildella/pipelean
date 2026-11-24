/** @typedef {import('./types.js').StrategyFn} StrategyFn */

import {assertSyncCallback, assertSyncResult} from './shared.js'
import {assertNotDrop} from './sentinel.js'
import {assertEnrichOptions} from './enrich-options.js'
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

const mergePatch = (names, {
  state, index, patch,
}) => {
  assertNotDrop(patch, 'enrich steps cannot drop; return {} for a no-op')

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

const withName = (name, fn) =>
  Object.defineProperty(fn, 'name', {value: name})

const wrapStepStart = (name, {
  operation, index, total, onStepStart, sync,
}) => {
  const context = {operation: name, index, total}

  if (sync) {
    return withName(name, state => {
      assertSyncResult(
        onStepStart(context), 'enrichSync() onStepStart', 'enrich',
      )
      return operation(state)
    })
  }

  return withName(name, async state => {
    await onStepStart(context)
    return operation(state)
  })
}

const notifySuccessSync = (onStepSuccess, context, merged) => {
  assertSyncResult(
    onStepSuccess(context), 'enrichSync() onStepSuccess', 'enrich',
  )
  return merged
}

const notifySuccessAsync = (onStepSuccess, context, merged) =>
  Promise.resolve(onStepSuccess(context)).then(() => merged)

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

const guardError = (label, onError) => ctx =>
  assertSyncCallback(label, 'onError', onError(normalizeOperationError(ctx)))

const guardFailure = (label, onFailure) => ctx =>
  assertSyncCallback(label, 'onFailure', onFailure(normalizeFailure(ctx)))

const reduceOptions = ({strategy, onError, onFailure}, label) => ({
  strategy,
  ...onError ? {onError: guardError(label, onError)} : {},
  ...onFailure ? {onFailure: guardFailure(label, onFailure)} : {},
})

const finishEnrich = result => ({
  value: result.value,
  errors: result.errors.map(normalizeOperationError),
  sourceErrors: [],
  failure: normalizeFailure(result.failure),
})

/**
 * Validate an enrichment pipeline and prepare what both `enrich` and
 * `enrichSync` need: the steps, the step scanner, the reduce options and the
 * result shaping.
 *
 * `scannerFor` is the only coloured part: each twin passes its own sync/async
 * scanner builder, everything else is shared. `sync` selects how the step hooks
 * are dispatched: awaited by `enrich`, sync-checked by `enrichSync`.
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
  assertEnrichOptions(opts, label)

  const {
    strategy = collect, onError, onFailure, onStepStart, onStepSuccess,
  } = opts

  const names = operations.map(operationName)
  const total = names.length
  const syncLabel = sync ? label : undefined

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
    reduceOpts: reduceOptions({strategy, onError, onFailure}, syncLabel),
    assertInitial: initialState => assertEnrichState(initialState, label),
    finish: finishEnrich,
  }
}
