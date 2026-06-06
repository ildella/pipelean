/* eslint-disable max-lines */
import {getPlannedTotal, withTotal} from './shared.js'
import {collect, failFast, where} from './functional.js'

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
      return null
    } finally {
      if (onFinally)
        onFinally()
    }
  }

export const seriesSync = (...args) => {
  const immediate = typeof args[0] !== 'function'
  const [items, fn, opts = {}] = immediate ? args : [null, args[0], args[1]]

  // eslint-disable-next-line complexity, max-statements
  const run = inputItems => {
    const {
      strategy = collect, total,
      take, onProgress, onError, onFailure,
    } = opts
    const results = []
    const errors = []
    const strategyName = strategy.name ?? strategy
    const plannedTotal = getPlannedTotal({items: inputItems, take, total})

    const runFn = (item, index) => {
      const result = fn(item, index)
      if (onProgress && result !== undefined)
        onProgress(withTotal({item, result, index}, plannedTotal))
      return result
    }

    let index = 0
    let failure = false

    for (const item of inputItems) {
      if (take !== undefined && index >= take)
        break

      try {
        const result = runFn(item, index)
        if (result !== undefined) {
          results.push(result)
        }
      } catch (error) {
        if (strategyName === 'throw') {
          throw error
        }

        const errorContext = {item, error, index}

        if (onError)
          onError(withTotal(errorContext, plannedTotal))

        if (strategyName === 'failFast') {
          if (onFailure) {
            onFailure(errorContext)
          }
          return {results: [], errors, failure: errorContext}
        }

        if (strategyName === 'skip') {
          index++
          continue
        }

        errors.push(errorContext)
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

export const filterSync = (...args) => {
  const isPattern = x => x !== null &&
    typeof x === 'object' &&
    !Array.isArray(x)
  const toPredicate = x => isPattern(x) ? where(x) : x
  const immediate = typeof args[0] !== 'function' && !isPattern(args[0])
  const [items, rawPredicate, opts] = immediate
    ? args
    : [null, args[0], args[1]]
  const predicate = toPredicate(rawPredicate)

  const transform = (item, index) => {
    const keep = predicate(item, index)
    return keep ? item : undefined
  }

  const run = inputItems => seriesSync(inputItems, transform, opts)
  return immediate ? run(items) : run
}

export const findSync = (...args) => {
  const isPattern = x => x !== null &&
    typeof x === 'object' &&
    !Array.isArray(x)
  const toPredicate = x => isPattern(x) ? where(x) : x
  const immediate = typeof args[0] !== 'function' && !isPattern(args[0])
  const [items, rawPredicate, opts = {}] = immediate
    ? args
    : [null, args[0], args[1]]
  const predicate = toPredicate(rawPredicate)

  // eslint-disable-next-line complexity
  const run = inputItems => {
    const {
      strategy = collect, take, total, onError, onFailure,
    } = opts
    const errors = []
    const strategyName = strategy.name ?? strategy
    const plannedTotal = getPlannedTotal({items: inputItems, take, total})

    const finish = result => {
      const failure = strategyName === 'failLate' && errors.length > 0
        ? {errors}
        : false

      if (failure && onFailure)
        onFailure(failure)

      return {result, errors, failure}
    }

    let index = 0

    for (const item of inputItems) {
      if (take !== undefined && index >= take)
        break

      try {
        if (predicate(item, index))
          return finish(item)
      } catch (error) {
        if (strategyName === 'throw')
          throw error

        const errorContext = {item, error, index}

        if (onError)
          onError(withTotal(errorContext, plannedTotal))

        if (strategyName === 'failFast') {
          if (onFailure)
            onFailure(errorContext)
          return {result: undefined, errors, failure: errorContext}
        }

        if (strategyName === 'skip') {
          index++
          continue
        }

        errors.push(errorContext)
      }
      index++
    }

    return finish(undefined)
  }

  return immediate ? run(items) : run
}

// eslint-disable-next-line complexity, max-statements
export const scanSync = (iterable, scanner, initialValue, opts = {}) => {
  const {
    strategy = failFast, onError, onFailure, storePartialResults = true,
  } = opts
  const results = []
  let acc = initialValue
  const errors = []
  const strategyName = strategy.name ?? strategy
  const plannedTotal = getPlannedTotal({items: iterable})
  let index = 0

  for (const item of iterable) {
    try {
      acc = scanner(acc, item, index)
      if (storePartialResults)
        results.push(acc)
    } catch (error) {
      const errorContext = {item, error, index}

      if (strategyName === 'throw') {
        throw error
      }

      if (onError) {
        onError(withTotal(errorContext, plannedTotal))
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

export const reduceSync = (iterable, scanner, initialValue, opts) => {
  const merged = {...opts, storePartialResults: false}
  return scanSync(iterable, scanner, initialValue, merged)
}

export const scanReduceSync = reduceSync

export const pipeSync = (...fns) => input =>
  fns.reduce((acc, fn) =>
    acc === undefined ? undefined : fn(acc), input)
