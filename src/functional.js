export const failFast = Object.freeze({name: 'failFast'})
export const collect = Object.freeze({name: 'collect'})
export const failLate = Object.freeze({name: 'failLate'})
export const skip = Object.freeze({name: 'skip'})

// Aliases
export const fail = failFast
export const stopOnError = failFast

export const tryCatch = (fn, {
  onStart, onSuccess, onError, onFinally,
  rethrow = false,
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
      if (rethrow)
        throw error
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

export const series = (...args) => {
  const immediate = typeof args[0] !== 'function'
  const [items, fn, opts = {}] = immediate ? args : [null, args[0], args[1]]

  // eslint-disable-next-line complexity
  const run = async inputItems => {
    const {
      strategy = collect,
      take, onProgress, onError, onFailure,
    } = opts
    const results = []
    const errors = []

    // Wrap the function ONCE.
    // It handles onProgress (via onSuccess) and onError (via onError).
    // It rethrows so 'series' can handle the strategy.
    const safeFn = tryCatch(fn, {
      onSuccess: onProgress,
      onError,
      rethrow: true,
    })

    let index = 0
    let failure = null

    for await (const item of inputItems) {
      // eslint-disable-next-line no-undefined
      if (take !== undefined && index >= take)
        break

      try {
        const result = await safeFn(item, index)
        results.push(result)
      } catch (error) {
        const strategyName = strategy?.name ?? strategy

        if (strategyName === 'failFast') {
          if (onFailure) {
            onFailure({item, error})
          }
          return {results, errors, failure: {item, error}}
        }

        if (strategyName === 'skip') {
          // Don't collect errors, just continue
          // onError is still called via safeFn
          index++
          continue
        }

        errors.push({item, error})
      }
      index++
    }

    failure = strategy?.name === 'failLate' && errors.length > 0 ? true : null

    if (failure && onFailure) {
      onFailure(true)
    }

    return {results, errors, failure}
  }

  return immediate ? run(items) : run
}

export const filter = (...args) => {
  const immediate = typeof args[0] !== 'function'
  const [items, predicate, opts] = immediate ? args : [null, args[0], args[1]]

  // eslint-disable-next-line complexity, max-statements
  const run = async inputItems => {
    const {
      strategy = collect,
      onError: onErrorParam,
      take,
      onFailure,
    } = opts || {}

    const results = []
    const errors = []

    let index = 0
    let failure = null

    for await (const item of inputItems) {
      // eslint-disable-next-line no-undefined
      if (take !== undefined && results.length >= take) {
        break
      }

      try {
        const keep = await predicate(item, index)
        if (keep) {
          results.push(item)
        }
      } catch (error) {
        const strategyName = strategy?.name ?? strategy

        if (onErrorParam) {
          await onErrorParam(error)
        }

        if (strategyName === 'failFast') {
          if (onFailure) {
            onFailure({item, error})
          }
          return {results, errors, failure: {item, error}}
        }

        if (strategyName === 'skip') {
          index++
          continue
        }

        errors.push({item, error})
      }

      index++
    }

    failure = strategy?.name === 'failLate' && errors.length > 0 ? true : null

    if (failure && onFailure) {
      onFailure(true)
    }

    return {results, errors, failure}
  }

  return immediate ? run(items) : run
}

// eslint-disable-next-line complexity
export const scan = async (iterable, scanner, initialValue, opts = {}) => {
  const {strategy = failFast, onError, onFailure} = opts
  const results = []
  let acc = initialValue
  const errors = []

  for await (const item of iterable) {
    try {
      acc = await scanner(acc, item)
      results.push(acc)
    } catch (error) {
      const strategyName = strategy?.name ?? strategy

      if (onError) {
        await onError(error)
      }

      if (strategyName === 'failFast') {
        if (onFailure) {
          onFailure({item, error})
        }
        errors.push({item, error})
        return {
          results,
          errors,
          failure: {item, error},
        }
      }

      if (strategyName === 'skip') {
        continue
      }

      errors.push({item, error})
    }
  }

  const failure =
    strategy?.name === 'failLate' && errors.length > 0 ? true : null

  if (failure && onFailure) {
    onFailure(true)
  }

  return {results, errors, failure}
}

export const pipe = (...fns) => input =>
  fns.reduce(async (acc, fn) => fn(await acc), input)

export const compose = pipe

/*
  "Lazy" iterator (it yields items one by one).
  This forces the consumer to check every single item to
    see if it's an error or a valid result
  Alpha Code - not to be used yet.
*/

export async function * safeAsyncIterator (iterable, transform, {
  onError = failFast,
} = {}) {
  for await (const item of iterable) {
    try {
      // slightly stronger sync support
      yield await Promise.resolve(transform(item))
    } catch (error) {
      if (onError === failFast)
        throw error
      if (onError === collect)
        yield {error, item}
    }
  }
}

export const collectAsync = iterator => series(iterator, x => x)
