import {getPlannedTotal, withTotal} from './shared.js'
import {
  collect, createRunState, failFast,
} from './strategy.js'

const ASYNC_ONLY_OPTIONS = ['signal', 'pause', 'pauseOnErrors']

const isAbortSignal = signal =>
  typeof signal === 'object' &&
  signal !== null &&
  typeof signal.aborted === 'boolean' &&
  typeof signal.addEventListener === 'function' &&
  typeof signal.removeEventListener === 'function'

const isPauseOption = pause =>
  pause === undefined ||
  typeof pause === 'function' ||
  (typeof pause === 'number' && Number.isFinite(pause))

const assertSignal = signal => {
  if (signal !== undefined && !isAbortSignal(signal))
    throw new TypeError('signal must be an AbortSignal')
}

const assertPause = pause => {
  if (!isPauseOption(pause))
    throw new TypeError('pause must be a finite number or a function')
}

const assertSyncOptions = opts => {
  for (const key of ASYNC_ONLY_OPTIONS) {
    if (opts[key] !== undefined)
      throw new TypeError(
        `Sync combinators do not support the "${key}" option`,
      )
  }
}

const assertRecover = (opts, fold) => {
  const {recover} = opts

  if (recover === undefined)
    return

  if (!fold)
    throw new TypeError(
      'recover is only supported by folds (scan and reduce)',
    )

  if (typeof recover !== 'function')
    throw new TypeError('recover must be a function')
}

export const assertTake = (take, label) => {
  if (take !== undefined && (!Number.isInteger(take) || take < 0))
    throw new TypeError(`${label}() take must be a non-negative integer`)
}

const isFiniteNonNegative = value =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

export const assertTotal = (total, label) => {
  if (total !== undefined && !isFiniteNonNegative(total))
    throw new TypeError(`${label}() total must be a finite non-negative number`)
}

export const validateOptions = (opts, {sync = false, fold = false} = {}) => {
  assertRecover(opts, fold)

  if (sync) {
    assertSyncOptions(opts)
    return
  }

  assertSignal(opts.signal)
  assertPause(opts.pause)
}

/**
 * Everything one series run needs before the first item is pulled: the run
 * state, the planned total and the callback/pause knobs its step reads.
 */
export const planSeries = (opts, items, {sync = false, label} = {}) => {
  validateOptions(opts, {sync})

  const {
    strategy = collect, total, take,
    onProgress, onError, onFailure, onSourceError,
    pause, pauseOnErrors = false,
  } = opts

  const api = label ?? 'series'
  assertTake(take, api)
  assertTotal(total, api)

  return {
    state: createRunState(strategy, {
      onFailure, onSourceError, strategyLabel: label ?? 'series',
    }, label),
    total: getPlannedTotal({items, take, total}),
    take,
    onProgress,
    onError,
    pause,
    pauseOnErrors,
    signal: opts.signal,
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
const createFoldState = (opts, {keepPartials, readAcc}, label) => {
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
    strategyLabel: label ?? 'scan/reduce',
  }, label)
}

/**
 * Everything one fold run needs before the first item is pulled: the run state
 * (with the right result shape) plus the error-handling knobs.
 */
export const planFold = (
  opts, {items, keepPartials, readAcc}, {sync = false, label} = {},
) => {
  validateOptions(opts, {sync, fold: true})

  return {
    state: createFoldState(opts, {keepPartials, readAcc}, label),
    total: getPlannedTotal({items}),
    onError: opts.onError,
    recover: opts.recover,
    signal: opts.signal,
    pause: opts.pause,
    pauseOnErrors: opts.pauseOnErrors ?? false,
  }
}
