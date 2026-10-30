/* eslint-disable max-lines */

import {getPlannedTotal, withTotal} from './shared.js'
import {parseSearchArgs} from './search.js'
import {
  createRunState, failOnItem, failOnSource, normalizeFailure,
  normalizeOperationError, settle, toResult,
} from './strategy.js'

export {where} from './search.js'

export const failFast = Object.freeze({name: 'failFast'})
export const collect = Object.freeze({name: 'collect'})
export const failLate = Object.freeze({name: 'failLate'})
export const skip = Object.freeze({name: 'skip'})
export const rethrow = Object.freeze({name: 'throw'})

// Aliases
export const fail = failFast
export const stopOnError = failFast

export const tryCatch = (fn, {
  onStart, onSuccess, onError, onFinally,
} = {}) =>
  async (...args) => {
    try {
      if (onStart)
        onStart()
      const result = await fn(...args)
      if (onSuccess)
        await onSuccess(result)
      return result
    } catch (error) {
      if (onError)
        await onError(error)
      // undefined is the library-wide drop signal: pipe() short-circuits and
      // series() drops the item instead of keeping a null downstream.
      return undefined
    } finally {
      if (onFinally)
        onFinally()
    }
  }

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export const retry = (fn, {attempts = 3, delay: delayMs = 0} = {}) =>
  async (...args) => {
    let lastError
    for (let i = 0; i < attempts; i++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await fn(...args)
      } catch (error) {
        lastError = error

        const isLastAttempt = i === attempts - 1
        if (!isLastAttempt && delayMs > 0) {
          // eslint-disable-next-line no-await-in-loop
          await delay(delayMs)
        }
      }
    }
    throw lastError
  }

export const assign = (property, parse) => state => {
  const value = parse(state)
  return value === undefined ? {} : {[property]: value}
}

const runAsyncStrategy = async ({
  state, items, take, step,
}) => {
  let index = 0

  const iterate = async () => {
    for await (const item of items) {
      if (take !== undefined && index >= take)
        break

      const outcome = await step(item, index)
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
    const stop = await iterate()
    if (stop)
      return stop
  } catch (error) {
    const handled = failOnSource(state, {error, index})
    if (handled)
      return handled
  }

  return toResult(state, settle(state))
}

export const series = (...args) => {
  const immediate = typeof args[0] !== 'function'
  const [items, fn, opts = {}] = immediate ? args : [null, args[0], args[1]]

  const run = inputItems => {
    const {
      strategy = collect, total,
      take, onProgress, onError, onFailure, onSourceError,
      pause, pauseOnErrors = false,
    } = opts
    const state = createRunState(strategy, {onFailure, onSourceError})
    const plannedTotal = getPlannedTotal({items: inputItems, take, total})

    const runFn = async (item, index) => {
      const result = await fn(item, index)
      if (onProgress && result !== undefined)
        await onProgress(withTotal({item, result, index}, plannedTotal))
      return result
    }

    const waitForPause = async condition => {
      if (condition)
        await delay(pause)
    }

    const pauseAfterError = async outcome => {
      if (outcome === null)
        await waitForPause(pause && pauseOnErrors)
      else if (outcome.skip)
        await waitForPause(pause)
    }

    const step = async (item, index) => {
      try {
        const result = await runFn(item, index)
        // undefined means "drop this item" (this is how filter() works).
        if (result !== undefined)
          state.results.push(result)

        await waitForPause(pause)
      } catch (error) {
        if (state.strategyName === 'throw')
          throw error

        const errorContext = {item, error, index}

        if (onError)
          await onError(withTotal(errorContext, plannedTotal))

        const outcome = failOnItem(state, errorContext)

        await pauseAfterError(outcome)
        return outcome
      }

      return null
    }

    return runAsyncStrategy({
      state, items: inputItems, take, step,
    })
  }

  return immediate ? run(items) : run
}

export const filter = (...args) => {
  const {
    immediate, items, predicate, opts,
  } = parseSearchArgs(args)

  const transform = async (item, index) => {
    const keep = await predicate(item, index)

    return keep ? item : undefined
  }

  const run = inputItems => series(inputItems, transform, opts)
  return immediate ? run(items) : run
}

/**
 * One fold engine for `scan` and `reduce`.
 *
 * `keepPartials: true` returns `{ results, errors, sourceErrors, failure }`
 * with every intermediate accumulator; `false` returns
 * `{ value, errors, sourceErrors, failure }` with the last one.
 *
 * @param {{
 *  iterable: AsyncIterable|Array,
 *  scanner: (accumulator, item, index) => Promise<Accumulator>,
 *  initialValue: *,
 *  opts?: {strategy?: StrategyFn, onError?, onFailure?, onSourceError?},
 *  keepPartials: boolean
 * }} params
 */
const runScan = ({
  iterable, scanner, initialValue, opts = {}, keepPartials,
}) => {
  const {
    strategy = failFast, onError, onFailure, onSourceError,
  } = opts
  let acc = initialValue
  const plannedTotal = getPlannedTotal({items: iterable})
  const shape = ({
    results, errors, sourceErrors, failure,
  }) =>
    keepPartials
      ? {
        results, errors, sourceErrors, failure,
      }
      : {
        value: acc, errors, sourceErrors, failure,
      }
  const state = createRunState(strategy, {onFailure, onSourceError, shape})

  const step = async (item, index) => {
    try {
      acc = await scanner(acc, item, index)
      if (keepPartials)
        state.results.push(acc)
    } catch (error) {
      if (state.strategyName === 'throw')
        throw error

      const errorContext = {item, error, index}

      if (onError)
        await onError(withTotal(errorContext, plannedTotal))

      return failOnItem(state, errorContext)
    }

    return null
  }

  return runAsyncStrategy({state, items: iterable, step})
}

/**
 * Fold over data items and keep every intermediate accumulator.
 *
 * Use when each item depends on the previous one AND every intermediate value
 * is itself useful. Default strategy is `failFast` (a half-done fold is
 * usually meaningless); note that `failFast` clears `results` on failure.
 *
 * @param {AsyncIterable|Array} iterable - Source of values.
 * @param {(accumulator, item, index) => Promise<Accumulator>} scanner
 * @param {*} initialValue
 * @param {{strategy?: StrategyFn, onError?, onFailure?, onSourceError?}} opts
 */
// eslint-disable-next-line max-params
export const scan = (iterable, scanner, initialValue, opts = {}) =>
  runScan({
    iterable, scanner, initialValue, opts, keepPartials: true,
  })

/**
 * Fold over data items and keep only the final accumulator.
 *
 * Use when the last value is all you need: sums, counts, growing records, or a
 * daemon loop built with `forever()` + `stopWhen()`.
 *
 * @param {AsyncIterable|Array} iterable - Source of values.
 * @param {(accumulator, item, index) => Promise<Accumulator>} scanner
 * @param {*} initialValue
 * @param {{strategy?: StrategyFn, onError?, onFailure?, onSourceError?}} opts
 */
// eslint-disable-next-line max-params
export const reduce = (iterable, scanner, initialValue, opts = {}) =>
  runScan({
    iterable, scanner, initialValue, opts, keepPartials: false,
  })

/**
 * Enrich one input through an ordered list of steps.
 *
 * `enrich` is literally `reduce` over your steps:
 * `enrich(ops)(input) === reduce(ops, (s, op) => ({...s, ...op(s)}), input)`.
 * In FP terms it is a fold over endomorphisms `State -> Patch` with a
 * shallow `merge` combiner.
 *
 * Each operation receives the current state and returns an object patch that is
 * shallow-merged in. The pipeline is built once and reused with different
 * inputs; errors are reported per operation, named after the function.
 *
 * @param {Array<(state) => object>} operations
 * @param {{strategy?: StrategyFn, onError?, onFailure?}} opts
 * @returns {(initialState) => Promise<{value, errors, failure}>}
 */
export const enrich = (operations, opts = {}) => {
  if (!Array.isArray(operations))
    throw new TypeError('enrich() requires an array of operations')
  for (const op of operations) {
    if (typeof op !== 'function')
      throw new TypeError('enrich() requires every operation to be a function')
  }

  const {strategy = collect, onError, onFailure} = opts

  return async initialState => {
    if (initialState === null ||
      typeof initialState !== 'object' ||
      Array.isArray(initialState)) {
      throw new TypeError(
        'enrich() requires initialState to be a non-null, non-array object',
      )
    }

    const scanner = async (state, operation, index) => {
      const patch = await operation(state)
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

    const reduceOpts = {
      strategy,
      ...onError
        ? {onError: ctx => onError(normalizeOperationError(ctx))}
        : {},
      ...onFailure
        ? {onFailure: ctx => onFailure(normalizeFailure(ctx))}
        : {},
    }

    const result = await reduce(
      operations, scanner, initialState, reduceOpts,
    )

    return {
      value: result.value,
      errors: result.errors.map(normalizeOperationError),
      failure: normalizeFailure(result.failure),
    }
  }
}

const runBranch = (fn, key, index) =>
  // Start from a resolved promise so a synchronous throw becomes a rejection.
  Promise.resolve().then(() => fn(key, index))

/**
 * Fork/join over a record of named async tasks.
 *
 * Every task starts immediately and `join` waits for all of them to settle —
 * there is no cancellation, no scheduler, and completion order never affects
 * the shape of the result. Errors are data, per branch, using the same error
 * strategies as `enrich`:
 *
 * - `collect` (default) keeps the successful branches in `value` and the
 *   failed ones in `errors` as `{operation, error, index}`; `failure` is false.
 * - `failLate` behaves like `collect` but sets `failure: {errors}`.
 * - `failFast` is an alias of `failLate`: branches already started and cannot
 *   be stopped without an AbortSignal.
 * - `skip` keeps `errors` empty while still calling `onError`.
 * - `rethrow` throws the original error of the first failed branch, by
 *   declaration order, once every branch has settled.
 *
 * A branch resolving `undefined` is a success with value `undefined`: the
 * "undefined drops the item" convention belongs to iteration, not to a fork.
 *
 * Rejects with a `TypeError` for a non-record input — including a thenable
 * such as an un-awaited `Promise` — before any branch starts.
 *
 * @param {Record<string, (key: string, index: number) => any>} tasks
 * @param {{strategy?: StrategyFn, onError?, onFailure?}} opts
 * @returns {Promise<{value: object, errors: Array, failure: false|object}>}
 */
// eslint-disable-next-line complexity, max-statements
export const join = async (tasks, opts = {}) => {
  if (tasks === null || typeof tasks !== 'object' || Array.isArray(tasks))
    throw new TypeError('join() requires a record of named async functions')

  const entries = Object.entries(tasks)
  if (entries.length === 0 && typeof tasks.then === 'function')
    throw new TypeError(
      'join() received a thenable, not a record of tasks ' +
      '(did you forget to await it?)',
    )

  for (const [key, fn] of entries) {
    if (typeof fn !== 'function')
      throw new TypeError(`join() requires task "${key}" to be a function`)
  }

  const {strategy = collect, onError, onFailure} = opts
  const strategyName = strategy.name ?? strategy
  // failFast cannot stop branches that already started; treat it as failLate.
  const isFailLate = strategyName === 'failLate' || strategyName === 'failFast'

  const value = {}
  const errors = []

  const settled = await Promise.allSettled(
    entries.map(([key, fn], index) => runBranch(fn, key, index)),
  )

  for (let index = 0; index < settled.length; index++) {
    const key = entries[index][0]
    const outcome = settled[index]

    if (outcome.status === 'fulfilled') {
      value[key] = outcome.value
      continue
    }

    // rethrow: defer to a single throw once every branch has settled.
    if (strategyName === 'throw')
      continue

    const context = {operation: key, error: outcome.reason, index}

    if (onError) {
      // eslint-disable-next-line no-await-in-loop
      await onError(context)
    }

    if (strategyName !== 'skip')
      errors.push(context)
  }

  if (strategyName === 'throw') {
    const firstFailed = settled.find(outcome => outcome.status === 'rejected')
    if (firstFailed)
      throw firstFailed.reason
    return {value, errors, failure: false}
  }

  const failure = isFailLate && errors.length > 0 ? {errors} : false

  // join awaits its failure callback so an async onFailure that rejects cannot
  // fire after the result has resolved (an unhandled rejection). The iteration
  // combinators call onFailure synchronously; join is stricter on purpose.
  if (failure && onFailure)
    await onFailure(failure)

  return {value, errors, failure}
}

export {normalizeOperationError}

export const pipe = (...fns) => input =>
  fns.reduce(async (acc, fn) => {
    const value = await acc

    return value === undefined ? undefined : fn(value)
  }, input)
