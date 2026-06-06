import {test, expect, vi} from 'vitest'
import {
  failLate, reduce, scanReduce, rethrow,
} from '$src/functional'

test('returns final accumulated value', async () => {
  const tracks = [
    {duration: 5},
    {duration: 7},
    {duration: 10},
  ]

  const {value} = await reduce(
    tracks,
    (accumulator, {duration}) => accumulator + duration,
    0,
  )

  expect(value).toBe(22)
})

test('empty iterable returns initial value', async () => {
  const {value} = await reduce(
    [],
    (accumulator, item) => accumulator + item,
    42,
  )

  expect(value).toBe(42)
})

test('works with async scanner', async () => {
  const {value} = await reduce(
    [1, 2, 3],
    async (acc, item) => {
      await new Promise(resolve => setTimeout(resolve, 1))
      return acc + item
    },
    0,
  )

  expect(value).toBe(6)
})

test('failFast stops on error and returns no value', async () => {
  const onError = vi.fn()
  const onFailure = vi.fn()

  const {value, errors, failure} = await reduce(
    [1, 2, 3],
    (acc, item) => {
      if (item === 2)
        throw new Error('bang')
      return acc + item
    },
    0,
    {onError, onFailure},
  )

  expect(value).toBeUndefined()
  expect(errors).toEqual([])
  expect(failure).toEqual({
    item: 2,
    error: new Error('bang'),
    index: 1,
  })
  expect(onError).toHaveBeenCalledOnce()
  expect(onFailure).toHaveBeenCalledOnce()
})

test('failLate collects errors and returns partial value', async () => {
  const onFailure = vi.fn()

  const {value, errors, failure} = await reduce(
    [1, 2, 3],
    (acc, item) => {
      if (item > 1)
        throw new Error(`Error at ${item}`)
      return acc + item
    },
    0,
    {strategy: failLate, onFailure},
  )

  expect(value).toBe(1)
  expect(errors).toHaveLength(2)
  expect(failure).toEqual({errors})
  expect(onFailure).toHaveBeenCalledWith({errors})
})

test('throw strategy rejects', async () => {
  await expect(reduce([1, 2, 3], (acc, item) => {
    if (item === 2)
      throw new Error('bang')
    return acc + item
  }, 0, {strategy: rethrow})).rejects.toThrow('bang')
})

test('default strategy is failFast', async () => {
  const {value, failure} = await reduce(
    [1, 2, 3],
    (acc, item) => {
      if (item === 2)
        throw new Error('bang')
      return acc + item
    },
    0,
  )

  expect(value).toBeUndefined()
  expect(failure).toBeTruthy()
})

test('scanReduce alias points to reduce', () => {
  expect(scanReduce).toBe(reduce)
})
