export const failFast = Object.freeze({name: 'failFast'})
export const skip = Object.freeze({name: 'skip'})
export const collect = Object.freeze({name: 'collect'})
export const none = Object.freeze({name: 'none'})

export const safeMap = (...args) => {
  const immediate = Array.isArray(args[0])
  const [items, fn, opts = {}] = immediate ? args : [null, args[0], args[1]]
  const execute = async inputItems => {
    const {onError = failFast, limit} = opts
    const results = []
    const errors = []
    let processed = 0
    for await (const [index, item] of inputItems.entries()) {
      // eslint-disable-next-line no-undefined
      if (limit !== undefined && processed >= limit)
        break
      try {
        results.push(await Promise.resolve(fn(item, index)))
      } catch (error) {
        if (onError === failFast)
          return {results, errors, failure: {item, error}}
        if (onError === none)
          continue
        errors.push({item, error})
      }
      processed += 1
    }
    // Return plain array for 'none' strategy, structured result otherwise
    if (onError === none)
      return results
    return {results, errors, failure: null}
  }
  return immediate ? execute(items) : execute
}

export const safeFilter = (...args) => {
  const immediate = Array.isArray(args[0])
  const [items, predicate, opts = {}] = immediate ? args : [null, args[0], args[1]]
  const execute = async inputItems => {
    const {onError = failFast} = opts
    const results = []
    const errors = []
    for await (const [index, item] of inputItems.entries()) {
      try {
        const keep = await Promise.resolve(predicate(item, index))
        if (keep)
          results.push(item)
      } catch (error) {
        if (onError === failFast)
          return {results, errors, failure: {item, error}}
        if (onError === none)
          continue
        errors.push({item, error})
      }
    }
    // Return plain array for 'none' strategy, structured result otherwise
    if (onError === none)
      return results
    return {results, errors, failure: null}
  }
  return immediate ? execute(items) : execute
}

// OLD mapSeries, now rebuilt as a special case of safeMap
// export const mapSeries = async (array, asyncFn, {limit} = {}) => {
//   const results = []
//   let count = 0
//   for await (const item of array) {
//     if (limit && count >= limit) {
//       break
//     }
//     results.push(await asyncFn(item))
//     count += 1
//   }
//   return results
// }

export const mapSeries = (array, asyncFn, {limit} = {}) =>
  safeMap(array, asyncFn, {onError: none, limit})

export const safePipe = (...steps) => async items => {
  const allErrors = []
  let current = items
  for await (const step of steps) {
    const {results, errors, failure} = await step(current)
    allErrors.push(...errors)
    if (failure)
      return {results, errors: allErrors, failure}
    current = results
  }
  return {results: current, errors: allErrors, failure: null}
}

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
      if (onError === skip)
        continue
      if (onError === collect)
        yield {error, item}
    }
  }
}

// export const scanSeries = async (iterable, scanner, initialValue) => {
//   const results = []
//   let acc = initialValue
//   for await (const item of iterable) {
//     acc = await scanner(acc, item)
//     results.push(acc)
//   }
//   return results
// }

// export const unwrapIterator = async iterator => {
//   const accumulator = []
//   for await (const item of iterator) {
//     accumulator.push(item)
//   }
//   return accumulator
// }

export const collectAsync = async (iterable, {onError = none} = {}) => {
  const results = []
  for await (const item of safeAsyncIterator(iterable, x => x, {onError})) {
    results.push(item)
  }
  return results
}

export const safeReduce = async (iterable, scanner, {initialValue} = {}) => {
  const results = []
  let acc = initialValue
  for await (const item of iterable) {
    acc = await scanner(acc, item)
    results.push(acc)
  }
  return results
}

export const unwrapIterator = collectAsync
export const scanSeries = safeReduce

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
      return onError ? onError(error) : null
    } finally {
      if (onFinally)
        onFinally()
    }
  }
