import {failFast, collect} from '$src/functional'

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
