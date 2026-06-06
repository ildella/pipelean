/* eslint-disable max-lines */
import {getPlannedTotal, withTotal} from './shared.js'

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

// eslint-disable-next-line max-lines-per-function
export const series = (...args) => {
  const immediate = typeof args[0] !== 'function'
  const [items, fn, opts = {}] = immediate ? args : [null, args[0], args[1]]

  // eslint-disable-next-line complexity, max-statements
  const run = async inputItems => {
    const {
      strategy = collect, total,
      take, onProgress, onError, onFailure, pause, pauseOnErrors = false,
    } = opts
    const results = []
    const errors = []
    const strategyName = strategy.name ?? strategy
    const plannedTotal = getPlannedTotal({items: inputItems, take, total})

    const runFn = async (item, index) => {
      const result = await fn(item, index)
      if (onProgress && result !== undefined)
        await onProgress(withTotal({item, result, index}, plannedTotal))
      return result
    }

    let index = 0
    let failure = false

    for await (const item of inputItems) {
      if (take !== undefined && index >= take)
        break

      try {
        const result = await runFn(item, index)
        // undefined is the sentinel value for "drop this item".
        // This enables selection/filtering within pipes and
        // is how filter() works internally.
        if (result !== undefined) {
          results.push(result)
        }
        // Pause after successful item
        if (pause) {
          await delay(pause)
        }
      } catch (error) {
        if (strategyName === 'throw') {
          throw error
        }

        const errorContext = {item, error, index}

        if (onError)
          await onError(withTotal(errorContext, plannedTotal))

        if (strategyName === 'failFast') {
          if (onFailure) {
            onFailure(errorContext)
          }
          return {results: [], errors, failure: errorContext}
        }

        if (strategyName === 'skip') {
          index++
          if (pause) {
            await delay(pause)
          }
          continue
        }

        errors.push(errorContext)
        if (pause && pauseOnErrors) {
          await delay(pause)
        }
      }
      index++
    }

    failure = strategyName === 'failLate' && errors.length > 0
      ? {errors}
      : false

    if (failure && onFailure) {
      onFailure(failure)
    }

    return {results, errors, failure}
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
// eslint-disable-next-line complexity, max-statements
export const scan = async (iterable, scanner, initialValue, opts = {}) => {
  const {
    strategy = failFast, onError, onFailure, storePartialResults = true,
  } = opts
  const results = []
  let acc = initialValue
  const errors = []
  const strategyName = strategy.name ?? strategy
  const plannedTotal = getPlannedTotal({items: iterable})
  let index = 0

  for await (const item of iterable) {
    try {
      acc = await scanner(acc, item, index)
      if (storePartialResults)
        results.push(acc)
    } catch (error) {
      const errorContext = {item, error, index}

      if (strategyName === 'throw') {
        throw error
      }

      if (onError) {
        await onError(withTotal(errorContext, plannedTotal))
      }

      if (strategyName === 'failFast') {
        if (onFailure) {
          onFailure(errorContext)
        }
        return storePartialResults
          ? {results: [], errors, failure: errorContext}
          : {value: acc, errors, failure: errorContext}
      }

      if (strategyName === 'skip') {
        index++
        continue
      }

      errors.push(errorContext)
    }
    index++
  }

  const failure =
    strategyName === 'failLate' && errors.length > 0
      ? {errors}
      : false

  if (failure && onFailure) {
    onFailure(failure)
  }

  return storePartialResults
    ? {results, errors, failure}
    : {value: acc, errors, failure}
}

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
