import {test, expect} from 'vitest'
import {unwrapIterator} from '$lib/functional'

test('collects async iterator into array', async () => {
  const gen = async function * () {
    yield 1
    yield 2
    yield 3
  }
  await expect(unwrapIterator(gen())).resolves.toEqual([1, 2, 3])
})

test('handles empty iterator', async () => {
  // eslint-disable-next-line no-empty-function
  const gen = async function * () {}
  await expect(unwrapIterator(gen())).resolves.toEqual([])
})
