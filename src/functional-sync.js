/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import {getPlannedTotal, isPatternObject, withTotal} from './shared.js'
import {
  collect, failFast, normalizeOperationError, where,
} from './functional.js'

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
      take, onProgress, onError, onFailure, onSourceError,
    } = opts
    const results = []
    const errors = []
    const sourceErrors = []
    const strategyName = strategy.name ?? strategy
    const plannedTotal = getPlannedTotal({items: inputItems, take, total})

    const runFn = (item, index) => {
      const result = fn(item, index)
      if (onProgress && result !== undefined)
        onProgress(withTotal({item, result, index}, plannedTotal))
      return result
    }

    let index = 0

    try {
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
            return {
              results: [], errors, sourceErrors, failure: errorContext,
            }
          }

          if (strategyName === 'skip') {
            index++
            continue
          }

          errors.push(errorContext)
        }
        index++
      }
    } catch (error) {
      if (strategyName === 'throw') {
        throw error
      }

      const sourceContext = {error, index}

      if (onSourceError)
        onSourceError(sourceContext)

      if (strategyName === 'failFast') {
        if (onFailure) {
          onFailure(sourceContext)
        }
        return {
          results: [],
          errors,
          sourceErrors: [sourceContext],
          failure: sourceContext,
        }
      }

      if (strategyName === 'skip') {
        return {
          results, errors, sourceErrors: [], failure: false,
        }
      }

      sourceErrors.push(sourceContext)
    }

    const failure = strategyName === 'failLate' &&
      (errors.length > 0 || sourceErrors.length > 0)
      ? {errors: [...errors, ...sourceErrors]}
      : false

    if (failure && onFailure) {
      onFailure(failure)
    }

    return {
      results, errors, sourceErrors, failure,
    }
  }

  return immediate ? run(items) : run
}

export const filterSync = (...args) => {
  const toPredicate = x => isPatternObject(x) ? where(x) : x
  const immediate = typeof args[0] !== 'function' && !isPatternObject(args[0])
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
  const toPredicate = x => isPatternObject(x) ? where(x) : x
  const immediate = typeof args[0] !== 'function' && !isPatternObject(args[0])
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
    strategy = failFast, onError, onFailure, onSourceError,
    storePartialResults = true,
  } = opts
  const results = []
  let acc = initialValue
  const errors = []
  const sourceErrors = []
  const strategyName = strategy.name ?? strategy
  const plannedTotal = getPlannedTotal({items: iterable})
  let index = 0

  try {
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
            ? {
              results: [], errors, sourceErrors, failure: errorContext,
            }
            : {
              value: acc, errors, sourceErrors, failure: errorContext,
            }
        }

        if (strategyName === 'skip') {
          index++
          continue
        }

        errors.push(errorContext)
      }
      index++
    }
  } catch (error) {
    if (strategyName === 'throw') {
      throw error
    }

    const sourceContext = {error, index}

    if (onSourceError) {
      onSourceError(sourceContext)
    }

    if (strategyName === 'failFast') {
      if (onFailure) {
        onFailure(sourceContext)
      }
      return storePartialResults
        ? {
          results: [],
          errors,
          sourceErrors: [sourceContext],
          failure: sourceContext,
        }
        : {
          value: acc,
          errors,
          sourceErrors: [sourceContext],
          failure: sourceContext,
        }
    }

    if (strategyName === 'skip') {
      return storePartialResults
        ? {
          results, errors, sourceErrors: [], failure: false,
        }
        : {
          value: acc, errors, sourceErrors: [], failure: false,
        }
    }

    sourceErrors.push(sourceContext)
  }

  const failure =
    strategyName === 'failLate' &&
    (errors.length > 0 || sourceErrors.length > 0)
      ? {errors: [...errors, ...sourceErrors]}
      : false

  if (failure && onFailure) {
    onFailure(failure)
  }

  return storePartialResults
    ? {
      results, errors, sourceErrors, failure,
    }
    : {
      value: acc, errors, sourceErrors, failure,
    }
}

export const reduceSync = (iterable, scanner, initialValue, opts) => {
  const merged = {...opts, storePartialResults: false}
  return scanSync(iterable, scanner, initialValue, merged)
}

export const scanReduceSync = reduceSync

const normalizeFailure = failure => {
  if (failure === false)
    return false
  if (failure.errors)
    return {errors: failure.errors.map(normalizeOperationError)}
  return normalizeOperationError(failure)
}

export const flowSync = (operations, opts = {}) => {
  if (!Array.isArray(operations))
    throw new TypeError('flowSync() requires an array of operations')
  for (const op of operations) {
    if (typeof op !== 'function') {
      throw new TypeError(
        'flowSync() requires every operation to be a function',
      )
    }
  }

  const {strategy = collect, onError, onFailure} = opts

  return initialState => {
    if (initialState === null ||
      typeof initialState !== 'object' ||
      Array.isArray(initialState)) {
      throw new TypeError(
        'flowSync() requires initialState to be a non-null, non-array object',
      )
    }

    const scanner = (state, operation, index) => {
      const patch = operation(state)
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

    const result = reduceSync(
      operations, scanner, initialState, reduceOpts,
    )

    return {
      value: result.value,
      errors: result.errors.map(normalizeOperationError),
      failure: normalizeFailure(result.failure),
    }
  }
}

export const pipeSync = (...fns) => input =>
  fns.reduce((acc, fn) =>
    acc === undefined ? undefined : fn(acc), input)
