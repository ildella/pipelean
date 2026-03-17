export const failFast = Object.freeze({name: 'failFast'})
export const collect = Object.freeze({name: 'collect'})

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

  const run = async inputItems => {
    const {
      strategy = 'collect',
      take, onProgress, onError,
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
    for await (const item of inputItems) {
      // eslint-disable-next-line no-undefined
      if (take !== undefined && index >= take)
        break

      try {
        const result = await safeFn(item, index)
        results.push(result)
      } catch (error) {
        if (strategy === 'failFast') {
          return {results, errors, failure: {item, error}}
        }
        errors.push({item, error})
      }
      index++
    }
    return {results, errors, failure: null}
  }

  return immediate ? run(items) : run
}

export const filter = (...args) => {
  const immediate = typeof args[0] !== 'function'
  const [items, predicate, opts] = immediate ? args : [null, args[0], args[1]]

  // eslint-disable-next-line complexity, max-statements
  const run = async inputItems => {
    const {onError = 'failFast', take} = opts || {}
    const results = []
    const errors = []

    let index = 0
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
        if (onError === 'failFast') {
          return {results, errors, failure: {item, error}}
        }
        errors.push({item, error})
      }

      index++
    }
    return {results, errors, failure: null}
  }

  return immediate ? run(items) : run
}

export const safeScan = async (iterable, scanner, initialValue) => {
  const results = []
  let acc = initialValue

  for await (const item of iterable) {
    try {
      acc = await scanner(acc, item)
      results.push(acc)
    } catch (error) {
      // We cannot continue if a step fails, so we return the failure immediately.
      return {
        results,
        errors: [{item, error}],
        failure: {item, error},
      }
    }
  }

  return {results, errors: [], failure: null}
}

export const scan = safeScan

export const scanSeries = async (iterable, scanner, initialValue) => {
  const {results} = await scan(iterable, scanner, initialValue)
  return results
}
export const pipe = (...fns) => input =>
  fns.reduce(async (acc, fn) => fn(await acc), input)

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
