/* eslint-disable max-lines */

import {
  assertNoErrorCallbacks, assertRecover, assertRethrowStrategy,
  assertSyncCallback, assertSyncResult, assertUnsupportedOptions,
  getPlannedTotal, isSyncCallbackError, parseCallArgs,
} from './shared.js'
import {createHookOutcome} from './lifecycle.js'
import {parseSearchArgs} from './search.js'
import {makeEnricher} from './enrich-runner.js'
import {
  drop, isDrop, isUndefinedPolicyError, undefinedPolicyError,
} from './sentinel.js'
import {
  collect, createRunState, failOnSource, rethrow, settle, toResult,
} from './strategy.js'
import {
  handleItemError, settleFoldError,
} from './errors.js'
import {
  assertTake, assertTotal, notifyProgress, planFold, planSeries,
  validateOptions,
} from './run.js'

/**
 * @typedef {import('./types.js').StrategyFn} StrategyFn
 * @typedef {import('./types.js').IterationResult} IterationResult
 * @typedef {import('./types.js').ReduceResult} ReduceResult
 * @typedef {import('./types.js').FindResult} FindResult
 * @typedef {import('./types.js').EnrichResult} EnrichResult
 */

const shouldStopTake = (index, take) =>
  take !== undefined && index >= take

const runSyncStrategy = ({
  state, items, take, step,
}) => {
  let index = 0

  const iterate = () => {
    if (shouldStopTake(0, take))
      return null

    for (const item of items) {
      if (shouldStopTake(index, take))
        break

      const outcome = step(item, index)
      if (outcome?.stop)
        return outcome.result

      index++
      if (shouldStopTake(index, take))
        break
    }

    return null
  }

  try {
    const stop = iterate()
    if (stop)
      return stop
  } catch (error) {
    if (isSyncCallbackError(error) || isUndefinedPolicyError(error))
      throw error

    const handled = failOnSource(state, {error, index})
    if (handled)
      return handled
  }

  return toResult(state, settle(state))
}

const observeSync = (outcome, hookName, call) => {
  try {
    assertSyncResult(call(), `tryCatchSync() ${hookName}`, 'tryCatch')
  } catch (error) {
    if (isSyncCallbackError(error))
      throw error
    outcome.capture(error)
  }
}

const handleFailureSync = (outcome, {onError, recover}, context) => {
  const failureContext = {...context, error: outcome.primaryError()}
  if (onError) {
    const call = () => onError(failureContext)
    observeSync(outcome, 'onError', call)
  }
  if (!recover)
    return undefined

  try {
    const value = recover(failureContext)
    assertSyncResult(value, 'tryCatchSync() recover', 'tryCatch')
    outcome.clear()
    return value
  } catch (error) {
    if (isSyncCallbackError(error))
      throw error
    outcome.fail(error)
    return undefined
  }
}

/**
 * Synchronous twin of tryCatch: the same composable execution boundary with
 * the same rethrow-by-default policy, `recover` seam and hook contract.
 *
 * `fn`, every hook and `recover` must be synchronous: a returned Promise (or
 * any thenable) is a fatal TypeError pointing at tryCatch. That violation
 * escapes immediately and aborts the wrapper — hooks that have not run yet,
 * including onFinally, are skipped. A synchronous throw from fn or a hook is
 * handled by the contract, not fatal.
 *
 * Every hook and `recover` receives one context object: `{args, name}` plus
 * `result` on `onSuccess` and `error` on `onError`/`recover`. `args` is a copy
 * of the invocation's argument list, so mutating it cannot change what `fn`
 * received.
 */
export const tryCatchSync = (fn, opts = {}) => {
  const {
    onStart, onSuccess, onError, onFinally, recover, name,
  } = opts
  assertRecover(recover, 'tryCatchSync')

  return (...args) => {
    const outcome = createHookOutcome()
    const context = {args: [...args], name}
    let result
    let failed = false

    try {
      if (onStart) {
        const start = onStart(context)
        assertSyncResult(start, 'tryCatchSync() onStart', 'tryCatch')
      }
      result = fn(...args)
      assertSyncResult(result, 'tryCatchSync() fn', 'tryCatch')
    } catch (error) {
      if (isSyncCallbackError(error))
        throw error
      failed = true
      outcome.fail(error)
    }

    if (failed)
      result = handleFailureSync(outcome, {onError, recover}, context)
    else if (onSuccess) {
      const call = () => onSuccess({...context, result})
      observeSync(outcome, 'onSuccess', call)
    }

    if (onFinally) {
      const call = () => onFinally(context)
      observeSync(outcome, 'onFinally', call)
    }

    outcome.settle()
    return result
  }
}

const runSeriesSync = ({
  items, fn, opts, label,
}) => {
  const plan = planSeries(opts, items, {sync: true, label})

  const runFn = (item, index) => {
    const result = fn(item, index)
    assertSyncCallback(
      label, 'onProgress', notifyProgress(plan, {item, result, index}),
    )
    return result
  }

  const step = (item, index) => {
    try {
      const result = runFn(item, index)

      if (isDrop(result))
        return null

      if (result === undefined) {
        if (plan.onUndefined === 'error')
          throw undefinedPolicyError('seriesSync() mapper')
        return null
      }

      plan.state.results.push(result)
    } catch (error) {
      if (isUndefinedPolicyError(error))
        throw error

      return handleItemError(
        plan.state, {item, error, index}, plan,
      )
    }

    return null
  }

  return runSyncStrategy({
    state: plan.state, items, take: plan.take, step,
  })
}

const guardMapper = fn => (item, index) =>
  assertSyncCallback('seriesSync', 'mapper', fn(item, index))

/**
 * Sequential execution over a sync iterable, one item at a time.
 *
 * @returns {IterationResult|((items) => IterationResult)}
 */
export const seriesSync = (...args) => {
  const {
    immediate, items, fn, opts,
  } = parseCallArgs(args)

  const run = inputItems => runSeriesSync({
    items: inputItems, fn: guardMapper(fn), opts, label: 'seriesSync',
  })

  return immediate ? run(items) : run
}

/**
 * Sequential selection over a sync iterable.
 *
 * `onUndefined` belongs to the `seriesSync` family only: passing it here is
 * rejected instead of silently ignored.
 *
 * @returns {IterationResult|((items) => IterationResult)}
 */
export const filterSync = (...args) => {
  const {
    immediate, items, predicate, opts = {},
  } = parseSearchArgs(args)

  assertUnsupportedOptions(opts, ['onUndefined'], 'filterSync')

  const transform = (item, index) => {
    const keep = predicate(item, index)
    assertSyncResult(keep, 'filterSync() predicate', 'filter')
    return isDrop(keep) || !keep ? drop : item
  }

  const run = inputItems => runSeriesSync({
    items: inputItems, fn: transform, opts, label: 'filterSync',
  })

  return immediate ? run(items) : run
}

const toFindResult = (found, {
  errors, sourceErrors, failure,
}) => {
  const result = {
    value: found, errors, sourceErrors, failure,
  }

  Object.defineProperty(result, 'result', {
    get: () => found,
    enumerable: false,
    configurable: true,
  })

  return result
}

/**
 * First match in a sync iterable, stopping as soon as the predicate accepts.
 *
 * `onProgress` and `onUndefined` belong to the `series` family only: passing
 * either here is rejected instead of silently ignored.
 *
 * @returns {FindResult|((items) => FindResult)}
 */
export const findSync = (...args) => {
  const {
    immediate, items, predicate, opts,
  } = parseSearchArgs(args, {})

  assertUnsupportedOptions(opts, ['onProgress', 'onUndefined'], 'findSync')

  const run = inputItems => {
    validateOptions(opts, {sync: true})

    const {
      strategy = collect, take, total,
      onError, onFailure, onSourceError,
    } = opts
    assertTake(take, 'findSync')
    assertTotal(total, 'findSync')
    const plannedTotal = getPlannedTotal({items: inputItems, take, total})

    let found
    const shape = ({
      errors, sourceErrors, failure,
    }) => toFindResult(found, {errors, sourceErrors, failure})
    const state = createRunState(
      strategy, {onFailure, onSourceError, shape}, 'findSync',
    )

    const step = (item, index) => {
      try {
        const keep = predicate(item, index)
        assertSyncResult(keep, 'findSync() predicate', 'filter')
        if (keep && !isDrop(keep)) {
          found = item
          return {stop: true, result: toResult(state, settle(state))}
        }
      } catch (error) {
        return handleItemError(
          state, {item, error, index}, {onError, total: plannedTotal},
        )
      }

      return null
    }

    return runSyncStrategy({
      state, items: inputItems, take, step,
    })
  }

  return immediate ? run(items) : run
}

const runScanSync = ({
  iterable, scanner, initialValue, opts = {}, keepPartials,
}) => {
  const api = keepPartials ? 'scanSync' : 'reduceSync'
  const twin = keepPartials ? 'scan' : 'reduce'
  let acc = initialValue
  const plan = planFold(opts, {
    items: iterable,
    keepPartials,
    readAcc: () => acc,
  }, {sync: true, label: api})

  const commit = value => {
    acc = value
    if (keepPartials)
      plan.state.results.push(value)
  }

  const step = (item, index) => {
    const state = acc

    try {
      const next = scanner(acc, item, index)
      assertSyncResult(next, `${api}() scanner`, twin)
      commit(next)
    } catch (error) {
      const settled = settleFoldError(plan, {item, error, index}, state)
      if (!settled.recovered)
        return settled.errorOutcome

      commit(settled.acc)
    }

    return null
  }

  return runSyncStrategy({state: plan.state, items: iterable, step})
}

/**
 * Synchronous twin of `scan`.
 *
 * @returns {IterationResult}
 */
// eslint-disable-next-line max-params
export const scanSync = (iterable, scanner, initialValue, opts = {}) =>
  runScanSync({
    iterable, scanner, initialValue, opts, keepPartials: true,
  })

/**
 * Synchronous twin of `reduce`.
 *
 * @returns {ReduceResult}
 */
// eslint-disable-next-line max-params
export const reduceSync = (iterable, scanner, initialValue, opts = {}) =>
  runScanSync({
    iterable, scanner, initialValue, opts, keepPartials: false,
  })

/**
 * Synchronous twin of `enrich`: fold one input through ordered steps, merging
 * each returned patch into the accumulated state.
 *
 * Accepts the same `strategy` / `onError` / `onFailure` options and the same
 * two per-step hooks:
 *
 * - `onStepStart({operation, index, total})` before `operation(state)`.
 * - `onStepSuccess({operation, patch, index, total})` after the patch is
 *   validated and merged (`patch` is pre-merge).
 *
 * Operations, hooks and the `onError` / `onFailure` callbacks must be
 * synchronous: a returned Promise is rejected with a `TypeError` pointing at
 * `enrich`, never silently ignored. A synchronous throw from an operation, a
 * hook or a callback still flows into the strategy like a throwing operation.
 * Errors stay on `onError`; there is no `onStepError`.
 *
 * Only `strategy`, `onError`, `onFailure` and the two step hooks apply: the run
 * lifecycle (`signal`, `pause`, `take`, `onProgress`, …) and `recover` are
 * rejected with a `TypeError` when the pipeline is built.
 *
 * @param {Array<(state) => object>} operations
 * @param {{strategy?: StrategyFn, onError?, onFailure?, onStepStart?,
 *   onStepSuccess?}} opts
 * @returns {(initialState) => EnrichResult}
 */
export const enrichSync = (operations, opts = {}) =>
  makeEnricher({
    operations, opts, label: 'enrichSync', twin: 'enrich', sync: true,
  }, reduceSync)

export const pipeSync = (...fns) => input =>
  fns.reduce((acc, fn) => {
    if (acc === undefined || isDrop(acc))
      return acc

    const result = fn(acc)
    assertSyncResult(result, 'pipeSync() step', 'pipe')
    return result
  }, input)

const isAsyncIterable = value =>
  value !== null &&
  value !== undefined &&
  typeof value[Symbol.asyncIterator] === 'function'

const assertFoldSyncArgs = (iterable, reducer, rest) => {
  if (rest.length > 0)
    throw new TypeError('foldSync() takes 3 arguments; it accepts no options')

  if (typeof reducer !== 'function')
    throw new TypeError('foldSync() requires a reducer function')

  if (isAsyncIterable(iterable))
    throw new TypeError(
      'foldSync() does not support async iterables; use reduce()',
    )

  if (
    iterable === null ||
    iterable === undefined ||
    typeof iterable[Symbol.iterator] !== 'function'
  )
    throw new TypeError('foldSync() requires a sync iterable')
}

/**
 * Raw synchronous fold: no options, no strategy, no report.
 *
 * `foldSync` folds a sync iterable and returns the last accumulator directly.
 * For a pure fold it is behavior-identical to
 * `reduceSync(items, reducer, initial, {strategy: rethrow}).value`, with no
 * result object to unwrap and no engine involved.
 *
 * The reducer is `(accumulator, item, index) => accumulator`. An error thrown
 * by the reducer or by the iterable propagates unchanged — nothing wraps it.
 * `undefined` is a legal accumulator: folds never drop.
 *
 * Sync only, like `findSync`: an async iterable is rejected with a `TypeError`
 * pointing at `reduce()`. The reducer must be synchronous too: a returned
 * Promise is rejected with a `TypeError` pointing at `reduce()`.
 *
 * @param {Iterable} iterable - Sync source of values.
 * @param {(accumulator, item, index) => any} reducer
 * @param {*} initialValue
 * @returns {*} The final accumulator.
 */
// eslint-disable-next-line max-params
export const foldSync = (iterable, reducer, initialValue, ...rest) => {
  assertFoldSyncArgs(iterable, reducer, rest)

  let accumulator = initialValue
  let index = 0

  for (const item of iterable) {
    const next = reducer(accumulator, item, index)
    assertSyncResult(next, 'foldSync() reducer', 'reduce')
    accumulator = next
    index++
  }

  return accumulator
}

/**
 * Synchronous twin of `mapSeries`: sequential map, rethrow, bare array.
 *
 * `mapSeriesSync` is `seriesSync` with the strategy locked to `rethrow` and the
 * report unwrapped: it returns `.results` or throws the ORIGINAL error. It
 * accepts both call forms, like `seriesSync`:
 *
 * - `mapSeriesSync(items, fn, opts?)` runs immediately.
 * - `mapSeriesSync(fn, opts?)` returns `items => Array`.
 *
 * Every other option passes through untouched (`take`, `total`, `onProgress`,
 * …). A `strategy` other than `rethrow` / `'throw'` is a configuration mistake
 * and is rejected with a `TypeError`.
 *
 * Two inherited behaviors matter:
 *
 * - A mapper returning `undefined` DROPS the item, so the result can be shorter
 *   than the input. This is not `Array.prototype.map`.
 * - Under `rethrow` a failed item throws before any callback, so `onError`
 *   and `onFailure` can never fire: passing either (or `onSourceError`) is
 *   rejected with a `TypeError` instead of being silently ignored.
 *
 * Sync only, like `foldSync`: an async iterable is rejected with a `TypeError`
 * pointing at `mapSeries()`, and so is a mapper or an `onProgress` callback
 * that returns a Promise.
 *
 * @param {Iterable} items - Sync source of values.
 * @param {(item, index) => any} fn - Sequential mapper.
 * @param {{strategy?: 'throw'|StrategyFn, onProgress?, take?, total?}} opts
 * @returns {Array|((items) => Array)}
 */
export const mapSeriesSync = (...args) => {
  const {
    immediate, items, fn, opts,
  } = parseCallArgs(args)
  assertRethrowStrategy(opts.strategy, 'mapSeriesSync')
  assertNoErrorCallbacks(opts, 'mapSeriesSync')

  const run = inputItems => {
    if (isAsyncIterable(inputItems))
      throw new TypeError(
        'mapSeriesSync() does not support async iterables; use mapSeries()',
      )

    const mapper = (item, index) =>
      assertSyncCallback('mapSeriesSync', 'mapper', fn(item, index))

    return runSeriesSync({
      items: inputItems,
      fn: mapper,
      opts: {...opts, strategy: rethrow},
      label: 'mapSeriesSync',
    }).results
  }

  return immediate ? run(items) : run
}
