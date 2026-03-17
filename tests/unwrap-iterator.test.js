import {test, expect} from 'vitest'
import {unwrapIterator} from '$lib/functional'

test('collects async iterator into array', async () => {
  const gen = async function * () {
    yield 1
    yield 2
    yield 3
  }
  const {results} = await unwrapIterator(gen())
  expect(results).toEqual([1, 2, 3])
})

test('handles empty iterator', async () => {
  // eslint-disable-next-line no-empty-function
  const gen = async function * () {}
  const {results} = await unwrapIterator(gen())
  expect(results).toEqual([])
})
