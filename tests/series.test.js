import {test, expect} from 'vitest'
import {series, collect} from '$src/functional'

test('all items succeed returns results with no errors', async () => {
  const result = await series([1, 2, 3], x => x * 2)
  expect(result).toEqual({results: [2, 4, 6], errors: [], failure: false})
})

test('failFast stops on first error with partial results', async () => {
  const bang = new Error('bang')
  const result = await series([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return x * 10
  }, {strategy: 'failFast'})
  expect(result.results).toEqual([10])
  expect(result.failure).toEqual({item: 2, error: bang})
  expect(result.errors).toEqual([])
})

test('collect continues past errors same as skip', async () => {
  const bang = new Error('bang')
  const result = await series([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return x * 10
  }, {strategy: collect})
  expect(result.results).toEqual([10, 30])
  expect(result.errors).toEqual([{item: 2, error: bang}])
  expect(result.failure).toBe(false)
})

test('async mapping functions work', async () => {
  const result = await series([1, 2], x => Promise.resolve(x + 100))
  expect(result.results).toEqual([101, 102])
})

test('passes index as second arg to fn', async () => {
  const indices = []
  await series([10, 20, 30], (_item, index) => {
    indices.push(index)
    return index
  })
  expect(indices).toEqual([0, 1, 2])
})

test('empty array returns empty result shape', async () => {
  const result = await series([], x => x)
  expect(result).toEqual({results: [], errors: [], failure: false})
})

test('curried form returns a function', () => {
  const fn = series(x => x * 2)
  expect(typeof fn).toBe('function')
})

test('curried form executes when called with items', async () => {
  const double = series(x => x * 2)
  const result = await double([1, 2, 3])
  expect(result).toEqual({results: [2, 4, 6], errors: [], failure: false})
})
