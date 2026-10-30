// Source adapters: lazy iterable producers, consumed by series/reduce/scan,
// filter, findSync, or any raw for await / for of.
//
// forever is the unbounded source: 0, 1, 2, ... with no end. A service loop
// composes it with signal + pause + recover on the consumer; stopWhen remains
// the source-level predicate stop (a domain limit or content sentinel).
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

export const forever = () => ({
  async * [Symbol.asyncIterator] () {
    let index = 0
    while (true)
      yield index++
  },
})

export const foreverSync = () => ({
  * [Symbol.iterator] () {
    let index = 0
    while (true)
      yield index++
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
