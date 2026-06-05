import {test, expect} from 'vitest'
import {filterSync} from '$src/index'

test('predicate truthy keeps item in results', () => {
  const result = filterSync([1, 2, 3, 4], x => x > 2)
  expect(result).toEqual({results: [3, 4], errors: [], failure: false})
})

test('predicate falsy excludes item without error', () => {
  const result = filterSync([1, 2, 3], () => false)
  expect(result).toEqual({results: [], errors: [], failure: false})
})

test('predicate throws with failFast stops and populates failure', () => {
  const bang = new Error('bang')
  const result = filterSync([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return true
  }, {strategy: 'failFast'})
  expect(result.results).toEqual([])
  expect(result.failure).toEqual({item: 2, error: bang, index: 1})
  expect(result.errors).toEqual([])
})

test('predicate throws with default collect collects errors', () => {
  const bang = new Error('bang')
  const result = filterSync([1, 2, 3, 4], x => {
    if (x === 2 || x === 4)
      throw bang
    return true
  })
  expect(result.results).toEqual([1, 3])
  expect(result.failure).toBe(false)
  expect(result.errors).toEqual([
    {item: 2, error: bang, index: 1},
    {item: 4, error: bang, index: 3},
  ])
})

test('curried form returns a function', () => {
  const fn = filterSync(x => x > 2)
  expect(typeof fn).toBe('function')
})

test('curried form executes when called with items', () => {
  const evens = filterSync(x => x % 2 === 0)
  const result = evens([1, 2, 3, 4])
  expect(result).toEqual({results: [2, 4], errors: [], failure: false})
})

test('empty array returns empty result shape', () => {
  const result = filterSync([], () => true)
  expect(result).toEqual({results: [], errors: [], failure: false})
})

test('returns value synchronously not a promise', () => {
  const result = filterSync([1, 2, 3], x => x > 1)
  expect(result).not.toBeInstanceOf(Promise)
})
