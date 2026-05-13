import {test, expect, vi} from 'vitest'
import {failLate, scan, throw_} from '$src/functional'

test('threads accumulator through items', async () => {
  const {results} = await scan(
    [1, 2, 3],
    (acc, item) => Promise.resolve(acc + item),
    0,
  )
  expect(results).toEqual([1, 3, 6])
})

test('returns intermediate results', async () => {
  const {results} = await scan(
    ['a', 'b', 'c'],
    (acc, item) => Promise.resolve(acc + item),
    '',
  )
  expect(results).toEqual(['a', 'ab', 'abc'])
})

test('works with async scanner', async () => {
  const {results} = await scan(
    [10, 20],
    async (acc, item) => {
      await new Promise(resolve => setTimeout(resolve, 1))
      return acc + item
    },
    0,
  )
  expect(results).toEqual([10, 30])
})

test('failFast calls onError and onFailure with item context', async () => {
  const onError = vi.fn()
  const onFailure = vi.fn()
  const bang = new Error('bang')

  const result = await scan([1, 2, 3], (acc, item) => {
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

test('failLate calls onFailure with collected contextual errors', async () => {
  const onFailure = vi.fn()

  const result = await scan([1, 2, 3], (acc, item) => {
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

test('throw strategy throws without calling onError or onFailure', async () => {
  const onError = vi.fn()
  const onFailure = vi.fn()
  const bang = new Error('bang')

  await expect(scan([1, 2, 3], (acc, item) => {
    if (item === 2)
      throw bang
    return acc + item
  }, 0, {strategy: throw_, onError, onFailure})).rejects.toThrow(bang)

  expect(onError).not.toHaveBeenCalled()
  expect(onFailure).not.toHaveBeenCalled()
})
