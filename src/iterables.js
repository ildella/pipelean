// Source adapters: lazy iterable producers, consumed by series/reduce/scan,
// filter, findSync, or any raw for await / for of.
//
// stopWhen stops pulling from the source as soon as the predicate is truthy.
// The predicate is checked BEFORE yielding: the triggering item is pulled but
// not offered downstream ("cancel before work"). Stopping is a clean
// completion for every consumer — cancel is a shorter run, not a source error.

const forwardedLength = items =>
  typeof items?.length === 'number' ? {length: items.length} : {}

export const stopWhen = (items, predicate = () => false) => ({
  ...forwardedLength(items),
  async * [Symbol.asyncIterator] () {
    let index = 0
    for await (const item of items) {
      if (predicate(item, index))
        return
      yield item
      index++
    }
  },
})

export const stopWhenSync = (items, predicate = () => false) => ({
  ...forwardedLength(items),
  * [Symbol.iterator] () {
    let index = 0
    for (const item of items) {
      if (predicate(item, index))
        return
      yield item
      index++
    }
  },
})
