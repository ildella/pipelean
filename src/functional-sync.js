/* eslint-disable max-lines */

import {
  assertRethrowStrategy, getPlannedTotal, parseCallArgs,
} from './shared.js'
import {parseSearchArgs} from './search.js'
import {prepareEnrich} from './enrich.js'
import {
  collect, createRunState, failOnSource, rethrow, settle, toResult,
} from './strategy.js'
import {
  handleItemError, settleFoldError,
} from './errors.js'
import {
  notifyProgress, planFold, planSeries, validateOptions,
} from './run.js'

const runSyncStrategy = ({
  state, items, take, step,
}) => {
  let index = 0

  const iterate = () => {
    for (const item of items) {
      if (take !== undefined && index >= take)
        break

      const outcome = step(item, index)
      if (outcome?.stop)
        return outcome.result
      if (outcome?.skip) {
        index++
        continue
      }

      index++
    }

    return null
  }

  try {
    const stop = iterate()
    if (stop)
      return stop
  } catch (error) {
    const handled = failOnSource(state, {error, index})
    if (handled)
      return handled
  }

  return toResult(state, settle(state))
}

export const tryCatchSync = (fn, {
  onStart, onSuccess, onError, onFinally,
} = {}) =>
  (...args) => {
    try {
      if (onStart)
        onStart()
      const result = fn(...args)
      if (onSuccess)
        onSuccess(result)
      return result
    } catch (error) {
      if (onError)
        onError(error)
      // undefined is the library-wide drop signal (see tryCatch).
      return undefined
    } finally {
      if (onFinally)
        onFinally()
    }
  }

export const seriesSync = (...args) => {
  const {
    immediate, items, fn, opts,
  } = parseCallArgs(args)

  const run = inputItems => {
    const plan = planSeries(opts, inputItems, {sync: true})

    const runFn = (item, index) => {
      const result = fn(item, index)
      notifyProgress(plan, {item, result, index})
      return result
    }

    const step = (item, index) => {
      try {
        const result = runFn(item, index)
        if (result !== undefined)
          plan.state.results.push(result)
      } catch (error) {
        return handleItemError(
          plan.state, {item, error, index}, plan,
        )
      }

      return null
    }

    return runSyncStrategy({
      state: plan.state, items: inputItems, take: plan.take, step,
    })
  }

  return immediate ? run(items) : run
}

export const filterSync = (...args) => {
  const {
    immediate, items, predicate, opts,
  } = parseSearchArgs(args)

  const transform = (item, index) => {
    const keep = predicate(item, index)
    return keep ? item : undefined
  }

  const run = inputItems => seriesSync(inputItems, transform, opts)
  return immediate ? run(items) : run
}

export const findSync = (...args) => {
  const {
    immediate, items, predicate, opts,
  } = parseSearchArgs(args, {})

  const run = inputItems => {
    validateOptions(opts, {sync: true})

    const {
      strategy = collect, take, total,
      onError, onFailure, onSourceError,
    } = opts
    const plannedTotal = getPlannedTotal({items: inputItems, take, total})

    let found
    const shape = ({
      errors, sourceErrors, failure,
    }) => ({
      result: found, errors, sourceErrors, failure,
    })
    const state = createRunState(strategy, {onFailure, onSourceError, shape})

    const step = (item, index) => {
      try {
        if (predicate(item, index)) {
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
  let acc = initialValue
  const plan = planFold(opts, {
    items: iterable,
    keepPartials,
    readAcc: () => acc,
  }, {sync: true})

  const commit = value => {
    acc = value
    if (keepPartials)
      plan.state.results.push(value)
  }

  const step = (item, index) => {
    const state = acc

    try {
      commit(scanner(acc, item, index))
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

// eslint-disable-next-line max-params
export const scanSync = (iterable, scanner, initialValue, opts = {}) =>
  runScanSync({
    iterable, scanner, initialValue, opts, keepPartials: true,
  })

// eslint-disable-next-line max-params
export const reduceSync = (iterable, scanner, initialValue, opts = {}) =>
  runScanSync({
    iterable, scanner, initialValue, opts, keepPartials: false,
  })

/**
 * Synchronous twin of `enrich`: fold one input through ordered steps, merging
 * each returned patch into the accumulated state.
 *
 * @param {Array<(state) => object>} operations
 * @param {{strategy?: StrategyFn, onError?, onFailure?}} opts
 * @returns {(initialState) => {value, errors, failure}}
 */
export const enrichSync = (operations, opts = {}) => {
  const {
    scanner, reduceOpts, assertInitial, finish,
  } = prepareEnrich({
    operations,
    opts,
    label: 'enrichSync',
    scannerFor: merge => (state, operation, index) =>
      merge({
        state, operation, index, patch: operation(state),
      }),
  })

  return initialState => {
    assertInitial(initialState)

    return finish(reduceSync(
      operations, scanner, initialState, reduceOpts,
    ))
  }
}

export const pipeSync = (...fns) => input =>
  fns.reduce((acc, fn) =>
    acc === undefined ? undefined : fn(acc), input)

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
 * pointing at `reduce()`. The reducer is not awaited either, so an async
 * reducer produces a Promise accumulator — use `reduce()` for that.
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
    accumulator = reducer(accumulator, item, index)
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
 * - Under `rethrow` a failed item throws before any callback, so `onError` and
 *   `onFailure` never fire (dead configuration here, parity with
 *   `seriesSync(..., {strategy: rethrow})`).
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

  const run = inputItems =>
    seriesSync(inputItems, fn, {...opts, strategy: rethrow}).results

  return immediate ? run(items) : run
}
