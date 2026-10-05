/* eslint-disable max-lines */

import {getPlannedTotal, withTotal} from './shared.js'
import {parseSearchArgs} from './search.js'
import {
  aggregateFailure, handleItemError, handleSourceError, normalizeFailure,
  normalizeOperationError, seriesShape,
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
      return null
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
  items, take, strategyName, onSourceError, onFailure,
  results, errors, sourceErrors, shape, step,
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
    const handled = handleSourceError({
      error,
      index,
      strategyName,
      onSourceError,
      onFailure,
      results,
      errors,
      sourceErrors,
      shape,
    })
    if (handled)
      return handled
  }

  const failure = aggregateFailure({
    strategyName, onFailure, errors, sourceErrors,
  })

  return shape({
    results, errors, sourceErrors, failure,
  })
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
    const results = []
    const errors = []
    const sourceErrors = []
    const strategyName = strategy.name ?? strategy
    const plannedTotal = getPlannedTotal({items: inputItems, take, total})
    const shape = seriesShape

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
          results.push(result)

        await waitForPause(pause)
      } catch (error) {
        if (strategyName === 'throw')
          throw error

        const errorContext = {item, error, index}

        if (onError)
          await onError(withTotal(errorContext, plannedTotal))

        const outcome = handleItemError(errorContext, {
          strategyName, onFailure, errors, sourceErrors, shape,
        })

        await pauseAfterError(outcome)
        return outcome
      }

      return null
    }

    return runAsyncStrategy({
      items: inputItems,
      take,
      strategyName,
      onSourceError,
      onFailure,
      results,
      errors,
      sourceErrors,
      shape,
      step,
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
 * Accumulate values while scanning an iterable.
 *
 * By default `scan` behaves like the original implementation and returns a
 * `{ results, errors, failure }` object containing every intermediate result.
 *
 * When the caller only cares about the final accumulated value (e.g. using
 * `scan` as a pure reduce), set `storePartialResults: false`. In that mode the
 * function returns `{ value, errors, failure }`, where `value` is the last
 * successful accumulator.
 *
 * @param {AsyncIterable|Array} iterable - Source of values.
 * @param {(accumulator, item) => Promise<Accumulator>} scanner
 * @param {*} initialValue.
 * @param {{
 *  strategy?: StrategyFn, onError?, onFailure?, storePartialResults?: boolean
 * }} opts
 */
// eslint-disable-next-line max-params
export const scan = (iterable, scanner, initialValue, opts = {}) => {
  const {
    strategy = failFast, onError, onFailure, onSourceError,
    storePartialResults = true,
  } = opts
  const results = []
  let acc = initialValue
  const errors = []
  const sourceErrors = []
  const strategyName = strategy.name ?? strategy
  const plannedTotal = getPlannedTotal({items: iterable})
  const shape = ({
    results, errors, sourceErrors, failure,
  }) =>
    storePartialResults
      ? {
        results, errors, sourceErrors, failure,
      }
      : {
        value: acc, errors, sourceErrors, failure,
      }

  const step = async (item, index) => {
    try {
      acc = await scanner(acc, item, index)
      if (storePartialResults)
        results.push(acc)
    } catch (error) {
      if (strategyName === 'throw')
        throw error

      const errorContext = {item, error, index}

      if (onError)
        await onError(withTotal(errorContext, plannedTotal))

      return handleItemError(errorContext, {
        strategyName, onFailure, errors, sourceErrors, shape,
      })
    }

    return null
  }

  return runAsyncStrategy({
    items: iterable,
    strategyName,
    onSourceError,
    onFailure,
    results,
    errors,
    sourceErrors,
    shape,
    step,
  })
}

// Public API keeps the (iterable, scanner, initialValue, opts) signature.
// eslint-disable-next-line max-params
export const reduce = (iterable, scanner, initialValue, opts = {}) =>
  scan(iterable, scanner, initialValue, {...opts, storePartialResults: false})

export const scanReduce = reduce

export const flow = (operations, opts = {}) => {
  if (!Array.isArray(operations))
    throw new TypeError('flow() requires an array of operations')
  for (const op of operations) {
    if (typeof op !== 'function')
      throw new TypeError('flow() requires every operation to be a function')
  }

  const {strategy = collect, onError, onFailure} = opts

  return async initialState => {
    if (initialState === null ||
      typeof initialState !== 'object' ||
      Array.isArray(initialState)) {
      throw new TypeError(
        'flow() requires initialState to be a non-null, non-array object',
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
 * strategies as `flow`:
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
