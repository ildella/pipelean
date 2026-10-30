import {getPlannedTotal, withTotal} from './shared.js'
import {
  collect, createRunState, failFast, failOnItem,
} from './strategy.js'

const itemErrorContext = (state, {item, error, index}) => {
  if (state.strategyName === 'throw')
    throw error

  return {item, error, index}
}

/**
 * Turn an item error into a step outcome, notifying `onError` first.
 *
 * The sync twin leaves the callback fire-and-forget; `handleItemErrorAsync`
 * awaits it so an async `onError` settles before the run continues.
 */
export const handleItemError = (state, errorContext, {onError, total}) => {
  const context = itemErrorContext(state, errorContext)

  if (onError)
    onError(withTotal(context, total))

  return failOnItem(state, context)
}

export const handleItemErrorAsync = async (
  state, errorContext, {onError, total},
) => {
  const context = itemErrorContext(state, errorContext)

  if (onError)
    await onError(withTotal(context, total))

  return failOnItem(state, context)
}

/**
 * Everything one series run needs before the first item is pulled: the run
 * state, the planned total and the callback/pause knobs its step reads.
 */
export const planSeries = (opts, items) => {
  const {
    strategy = collect, total, take,
    onProgress, onError, onFailure, onSourceError,
    pause, pauseOnErrors = false,
  } = opts

  return {
    state: createRunState(strategy, {onFailure, onSourceError}),
    total: getPlannedTotal({items, take, total}),
    take,
    onProgress,
    onError,
    pause,
    pauseOnErrors,
  }
}

/** Report one item result, unless the item was dropped (undefined). */
export const notifyProgress = (plan, {item, result, index}) =>
  plan.onProgress && result !== undefined
    ? plan.onProgress(withTotal({item, result, index}, plan.total))
    : undefined

/**
 * Fold state: `scan` keeps every intermediate accumulator, `reduce` keeps the
 * last one, so the result shape differs but the base bookkeeping does not.
 */
const createFoldState = (opts, {keepPartials, readAcc}) => {
  const shape = ({
    results, errors, sourceErrors, failure,
  }) =>
    keepPartials
      ? {
        results, errors, sourceErrors, failure,
      }
      : {
        value: readAcc(), errors, sourceErrors, failure,
      }

  return createRunState(opts.strategy ?? failFast, {
    onFailure: opts.onFailure,
    onSourceError: opts.onSourceError,
    shape,
  })
}

/**
 * Everything one fold run needs before the first item is pulled: the run state
 * (with the right result shape) plus the error-handling knobs.
 */
export const planFold = (opts, {items, keepPartials, readAcc}) => ({
  state: createFoldState(opts, {keepPartials, readAcc}),
  total: getPlannedTotal({items}),
  onError: opts.onError,
})
