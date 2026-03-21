import {test, expect} from 'vitest'
import {filter} from '$src/functional'

test('predicate truthy keeps item in results', async () => {
  const result = await filter([1, 2, 3, 4], x => x > 2)
  expect(result).toEqual({results: [3, 4], errors: [], failure: null})
})

test('predicate falsy excludes item without error', async () => {
  const result = await filter([1, 2, 3], () => false)
  expect(result).toEqual({results: [], errors: [], failure: null})
})

test('predicate throws with failFast stops and populates failure', async () => {
  const bang = new Error('bang')
  const result = await filter([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return true
  }, {strategy: 'failFast'})
  expect(result.results).toEqual([1])
  expect(result.failure).toEqual({item: 2, error: bang})
  expect(result.errors).toEqual([])
})

test('predicate throws with default collect collects errors', async () => {
  const bang = new Error('bang')
  const result = await filter([1, 2, 3, 4], x => {
    if (x === 2 || x === 4)
      throw bang
    return true
  })
  expect(result.results).toEqual([1, 3])
  expect(result.failure).toBe(null)
  expect(result.errors).toEqual([
    {item: 2, error: bang},
    {item: 4, error: bang},
  ])
})

test('async predicates work', async () => {
  const result = await filter([1, 2, 3], x => Promise.resolve(x % 2 === 1))
  expect(result.results).toEqual([1, 3])
})

test('curried form returns a function', () => {
  const fn = filter(x => x > 2)
  expect(typeof fn).toBe('function')
})

test('curried form executes when called with items', async () => {
  const evens = filter(x => x % 2 === 0)
  const result = await evens([1, 2, 3, 4])
  expect(result).toEqual({results: [2, 4], errors: [], failure: null})
})

test('empty array returns empty result shape', async () => {
  const result = await filter([], () => true)
  expect(result).toEqual({results: [], errors: [], failure: null})
})
