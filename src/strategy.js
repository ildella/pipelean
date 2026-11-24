import {assertSyncCallback} from './shared.js'
import {strategyNameOf} from './strategy-name.js'

export const failFast = Object.freeze({name: 'failFast'})
export const collect = Object.freeze({name: 'collect'})
export const failLate = Object.freeze({name: 'failLate'})
export const skip = Object.freeze({name: 'skip'})
export const rethrow = Object.freeze({name: 'throw'})

const seriesShape = ({
  results, errors, sourceErrors, failure,
}) =>
  ({
    results, errors, sourceErrors, failure,
  })

/**
 * Shared bookkeeping for one run of a series or a fold.
 *
 * Everything a strategy decision needs to look at lives here: which strategy is
 * active, the callbacks, the collected errors and the function that turns the
 * run into a result. Helpers below take the state whole instead of receiving
 * the same seven fields as loose arguments.
 *
 * `label` is the sync api name ('seriesSync'); it is set only on the sync path
 * so the telemetry dispatch below can reject an async callback there.
 * `strategyLabel` names the api in a strategy validation error; it defaults to
 * `label` so sync apis report their own name.
 */
export const createRunState = (strategy, {
  onFailure, onSourceError, shape = seriesShape, results = [], strategyLabel,
}, label) => ({
  strategyName: strategyNameOf(strategy, strategyLabel ?? label ?? 'run'),
  onFailure,
  onSourceError,
  results,
  errors: [],
  sourceErrors: [],
  shape,
  label,
})

export const toResult = (state, failure) =>
  state.shape({
    results: state.results,
    errors: state.errors,
    sourceErrors: state.sourceErrors,
    failure,
  })

/** An item failed inside the mapping/scanner function. */
export const failOnItem = (state, errorContext) => {
  if (state.strategyName === 'failFast') {
    assertSyncCallback(
      state.label, 'onFailure', state.onFailure?.(errorContext),
    )
    return {
      stop: true,
      result: state.shape({
        results: [],
        errors: state.errors,
        sourceErrors: state.sourceErrors,
        failure: errorContext,
      }),
    }
  }

  if (state.strategyName === 'skip')
    return {skip: true}

  state.errors.push(errorContext)
  return null
}

/** The source itself failed (e.g. a generator dying mid-stream). */
export const failOnSource = (state, sourceContext) => {
  if (state.strategyName === 'throw')
    throw sourceContext.error

  assertSyncCallback(
    state.label, 'onSourceError', state.onSourceError?.(sourceContext),
  )

  if (state.strategyName === 'failFast') {
    assertSyncCallback(
      state.label, 'onFailure', state.onFailure?.(sourceContext),
    )
    return state.shape({
      results: [],
      errors: state.errors,
      sourceErrors: [sourceContext],
      failure: sourceContext,
    })
  }

  if (state.strategyName === 'skip')
    return state.shape({
      results: state.results,
      errors: state.errors,
      sourceErrors: [],
      failure: false,
    })

  state.sourceErrors.push(sourceContext)
  return null
}

/** End-of-run decision once iteration is over. */
export const settle = state => {
  const failure = state.strategyName === 'failLate' &&
    (state.errors.length > 0 || state.sourceErrors.length > 0)
    ? {errors: [...state.errors, ...state.sourceErrors]}
    : false

  if (failure && state.onFailure)
    assertSyncCallback(state.label, 'onFailure', state.onFailure(failure))

  return failure
}

export const normalizeOperationError = ({
  item: operation, error, index, total,
}) => {
  const base = {
    operation: operation.name || `operation-${index}`,
    error,
    index,
  }
  return total !== undefined ? {...base, total} : base
}

export const normalizeFailure = failure => {
  if (failure === false)
    return false
  if (failure.errors)
    return {errors: failure.errors.map(normalizeOperationError)}
  return normalizeOperationError(failure)
}
