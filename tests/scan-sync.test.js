import {test, expect, vi} from 'vitest'
import {failLate, scanSync, rethrow} from '$src/index'

test('threads accumulator through items', () => {
  const {results} = scanSync(
    [1, 2, 3],
    (acc, item) => acc + item,
    0,
  )
  expect(results).toEqual([1, 3, 6])
})

test('returns intermediate results', () => {
  const {results} = scanSync(
    ['a', 'b', 'c'],
    (acc, item) => acc + item,
    '',
  )
  expect(results).toEqual(['a', 'ab', 'abc'])
})

test('failFast calls onError and onFailure with item context', () => {
  const onError = vi.fn()
  const onFailure = vi.fn()
  const bang = new Error('bang')

  const result = scanSync([1, 2, 3], (acc, item) => {
    if (item === 2)
      throw bang
    return acc + item
  }, 0, {onError, onFailure})

  expect(onError).toHaveBeenCalledWith({
    item: 2,
    error: bang,
    index: 1,
    total: 3,
  })
  expect(onFailure).toHaveBeenCalledWith({item: 2, error: bang, index: 1})
  expect(result.failure).toEqual({item: 2, error: bang, index: 1})
  expect(result.results).toEqual([])
})

test('failLate calls onFailure with collected contextual errors', () => {
  const onFailure = vi.fn()

  const result = scanSync([1, 2, 3], (acc, item) => {
    if (item > 1)
      throw new Error(`Error at ${item}`)
    return acc + item
  }, 0, {strategy: failLate, onFailure})

  expect(result.errors).toEqual([
    {item: 2, error: new Error('Error at 2'), index: 1},
    {item: 3, error: new Error('Error at 3'), index: 2},
  ])
  expect(onFailure).toHaveBeenCalledWith({errors: result.errors})
  expect(result.failure).toEqual({errors: result.errors})
})

test('throw strategy throws without calling onError or onFailure', () => {
  const onError = vi.fn()
  const onFailure = vi.fn()
  const bang = new Error('bang')

  expect(() => scanSync([1, 2, 3], (acc, item) => {
    if (item === 2)
      throw bang
    return acc + item
  }, 0, {strategy: rethrow, onError, onFailure})).toThrow(bang)

  expect(onError).not.toHaveBeenCalled()
  expect(onFailure).not.toHaveBeenCalled()
})

test('returns value synchronously not a promise', () => {
  const result = scanSync([1, 2, 3], (acc, item) => acc + item, 0)
  expect(result).not.toBeInstanceOf(Promise)
})
