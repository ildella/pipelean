export const failFast = Object.freeze({name: 'failFast'})
export const skip = Object.freeze({name: 'skip'})
export const collect = Object.freeze({name: 'collect'})

export const safeMap = (...args) => {
  const immediate = Array.isArray(args[0])
  const [items, fn, opts] = immediate ? args : [null, args[0], args[1]]
  const execute = async inputItems => {
    const {onError = failFast} = opts || {}
    const results = []
    const errors = []
    for await (const [index, item] of inputItems.entries()) {
      try {
        results.push(await fn(item, index))
      } catch (error) {
        if (onError === failFast)
          return {results, errors, failure: {item, error}}
        errors.push({item, error})
      }
    }
    return {results, errors, failure: null}
  }
  return immediate ? execute(items) : execute
}

export const safeFilter = (...args) => {
  const immediate = Array.isArray(args[0])
  const [items, predicate, opts] = immediate ? args : [null, args[0], args[1]]
  const execute = async inputItems => {
    const {onError = failFast} = opts || {}
    const results = []
    const errors = []
    for await (const [index, item] of inputItems.entries()) {
      try {
        const keep = await predicate(item, index)
        if (keep)
          results.push(item)
      } catch (error) {
        if (onError === failFast)
          return {results, errors, failure: {item, error}}
        errors.push({item, error})
      }
    }
    return {results, errors, failure: null}
  }
  return immediate ? execute(items) : execute
}
export const mapSeries = async (array, asyncFn, {limit} = {}) => {
  const results = []
  let count = 0
  for await (const item of array) {
    if (limit && count >= limit) {
      break
    }
    results.push(await asyncFn(item))
    count += 1
  }
  return results
}
// export const mapSeries = (array, asyncFn, {limit} = {}) =>
//   safeMap(array, asyncFn, {onError: none, limit})

export const scanSeries = async (iterable, scanner, initialValue) => {
  const results = []
  let acc = initialValue
  for await (const item of iterable) {
    acc = await scanner(acc, item)
    results.push(acc)
  }
  return results
}

export const unwrapIterator = async iterator => {
  const accumulator = []
  for await (const item of iterator) {
    accumulator.push(item)
  }
  return accumulator
}

export const pipe = (...fns) => input =>
  fns.reduce((acc, fn) => fn(acc), input)

export const pipeAsync = (...fns) => input =>
  fns.reduce(async (acc, fn) => fn(await acc), input)

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

export const collectAsync = async (iterable, {onError = skip} = {}) => {
  const results = []
  for await (const item of safeAsyncIterator(iterable, x => x, {onError})) {
    results.push(item)
  }
  return results
}

// This should probably be a goal.
// export const unwrapIterator = collectAsync

export const tryCatch = (fn, {
  onStart, onSuccess, onError, onFinally,
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
      return onError ? onError(error) : null
    } finally {
      if (onFinally)
        onFinally()
    }
  }
