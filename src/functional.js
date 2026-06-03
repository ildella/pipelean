/* eslint-disable max-lines */
export const failFast = Object.freeze({name: 'failFast'})
export const collect = Object.freeze({name: 'collect'})
export const failLate = Object.freeze({name: 'failLate'})
export const skip = Object.freeze({name: 'skip'})
export const throw_ = Object.freeze({name: 'throw'})

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

const getKnownTotal = (items, total) =>
  total !== undefined ? total : items.length

const getPlannedTotal = ({items, take, total}) => {
  const knownTotal = getKnownTotal(items, total)

  if (knownTotal === undefined)
    return undefined

  if (take === undefined)
    return knownTotal

  return Math.min(take, knownTotal)
}

const withTotal = (payload, total) =>
  total === undefined ? payload : {...payload, total}

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
          : {errors, failure: errorContext}
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

export const scanReduce = (iterable, scanner, initialValue, opts = {}) =>
  scan(iterable, scanner, initialValue, {...opts, storePartialResults: false})

export const pipe = (...fns) => input =>
  fns.reduce(async (acc, fn) => {
    const value = await acc

    return value === undefined ? undefined : fn(value)
  }, input)
