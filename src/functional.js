export const failFast = Object.freeze({name: 'failFast'})
export const collect = Object.freeze({name: 'collect'})

export const series = (...args) => {
  const immediate = typeof args[0] !== 'function'
  const [items, fn, opts] = immediate ? args : [null, args[0], args[1]]

  // eslint-disable-next-line complexity, max-statements
  const run = async inputItems => {
    const {
      strategy = 'collect',
      take,
      onProgress,
      onError,
    } = opts || {}

    const results = []
    const errors = []

    let index = 0
    for await (const item of inputItems) {
      // eslint-disable-next-line no-undefined
      if (take !== undefined && index >= take) {
        break
      }

      try {
        const result = await fn(item, index)
        results.push(result)

        // Notify success
        if (onProgress) {
          await onProgress(result, item, index)
        }
      } catch (error) {
        if (onError) {
          await onError(error, item, index)
        }

        if (strategy === 'failFast') {
          return {
            results,
            errors,
            failure: {item, error},
          }
        }

        errors.push({item, error})
      }

      index++
    }
    return {results, errors, failure: null}
  }

  return immediate ? run(items) : run
}

/*
  Series
    Eager" iterator (it processes all items and returns an array).
*/
// export const safeMap = (...args) => {
//   // FIX: Detect "immediate" by checking if the first arg is a function.
//   // This allows immediate usage like: safeMap(myStream, fn)
//   // (Because streams/generators are objects, not functions)
//   const immediate = typeof args[0] !== 'function'
//   const [items, fn, opts] = immediate ? args : [null, args[0], args[1]]

//   const execute = async inputItems => {
//     const {onError = 'failFast', take} = opts || {}
//     const results = []
//     const errors = []

//     // FIX: Manual index tracking allows us to support ANY iterable (Streams/Generators)
//     // "for await...of" handles both Arrays and Async Iterables automatically.
//     let index = 0
//     for await (const item of inputItems) {
//       // eslint-disable-next-line no-undefined
//       if (take !== undefined && index >= take) {
//         break
//       }

//       try {
//         results.push(await fn(item, index))
//       } catch (error) {
//         if (onError === 'failFast') {
//           return {results, errors, failure: {item, error}}
//         }
//         // Default behavior: 'collect'
//         errors.push({item, error})
//       }

//       index++
//     }
//     return {results, errors, failure: null}
//   }

//   return immediate ? execute(items) : execute
// }

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

/*
  We use the same "immediate" vs "curried" pattern as execute
  But here args are: (iterable, fn, init) or (fn, init)
  Actually, usually scan takes (iterable, fn, init).
  Let's stick to your execute pattern style if you like,
  but typically scan is eager because you need the init value immediately.

  Let's keep it simple: Scan is almost always eager because of the 'initialValue'.
*/
export const safeScan = async (iterable, scanner, initialValue) => {
  const results = []
  let acc = initialValue

  // We reuse the iteration logic
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

export const scanSeries = async (iterable, scanner, initialValue) => {
  const {results} = await safeScan(iterable, scanner, initialValue)
  return results
}
export const pipeAsync = (...fns) => input =>
  fns.reduce(async (acc, fn) => fn(await acc), input)

/*
  "Lazy" iterator (it yields items one by one).
  This forces the consumer to check every single item to
    see if it's an error or a valid result
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

export const tryCatch = (fn, {
  onStart, onSuccess, onError, onFinally,
  rethrow = false,
} = {}) =>
  async (...args) => {
    // console.info('TRYCATCH |')
    try {
      if (onStart)
        onStart()
      // console.info('TRYCATCH | Started |', {args, onError})
      const result = await fn(...args)
      // console.info('TRYCATCH | Result |', {result})
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

export const retry = (fn, attempts) => async (...args) => {
  let lastError
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(...args)
    } catch (error) {
      lastError = error
      // Optional: wait a bit?
    }
  }
  throw lastError
}

// export const execute = safeMap
// export const series = execute
export const scan = safeScan
export const pipe = pipeAsync

export const unwrapIterator = iterator => series(iterator, x => x)
export const collectAsync = iterator => series(iterator, x => x)
