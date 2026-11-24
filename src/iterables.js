import {assertSyncCallback} from './shared.js'

const forwardedLength = items =>
  typeof items?.length === 'number' ? {length: items.length} : {}

export const stopWhen = (items, predicate = () => false) => ({
  ...forwardedLength(items),
  async * [Symbol.asyncIterator] () {
    let index = 0
    for await (const item of items) {
      if (await predicate(item, index))
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
      const stop = predicate(item, index)
      assertSyncCallback('stopWhenSync', 'predicate', stop)
      if (stop)
        return
      yield item
      index++
    }
  },
})
