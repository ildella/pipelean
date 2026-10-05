/* eslint-disable max-lines */

import {getPlannedTotal, withTotal} from './shared.js'
import {
  aggregateFailure, handleItemError, handleSourceError, seriesShape,
} from './strategy.js'

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

export const where = pattern => item =>
  Object.entries(pattern).every(([key, value]) => item[key] === value)

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
  const isPattern = x => x !== null &&
    typeof x === 'object' &&
    !Array.isArray(x)
  const toPredicate = x => isPattern(x) ? where(x) : x
  const immediate = typeof args[0] !== 'function' && !isPattern(args[0])
  const [items, rawPredicate, opts] = immediate
    ? args
    : [null, args[0], args[1]]
  const predicate = toPredicate(rawPredicate)

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

const normalizeOperationError = ({
  item: operation, error, index, total,
}) => {
  const base = {
    operation: operation.name || `operation-${index}`,
    error,
    index,
  }
  return total !== undefined ? {...base, total} : base
}

const normalizeFailure = failure => {
  if (failure === false)
    return false
  if (failure.errors)
    return {errors: failure.errors.map(normalizeOperationError)}
  return normalizeOperationError(failure)
}

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

export {normalizeOperationError}

export const pipe = (...fns) => input =>
  fns.reduce(async (acc, fn) => {
    const value = await acc

    return value === undefined ? undefined : fn(value)
  }, input)
