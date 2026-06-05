import {test, expect, vi} from 'vitest'
import {failLate, scanReduceSync, rethrow} from '$src/index'

test('returns final accumulated value', () => {
  const tracks = [
    {duration: 5},
    {duration: 7},
    {duration: 10},
  ]

  const {value} = scanReduceSync(
    tracks,
    (accumulator, {duration}) => accumulator + duration,
    0,
  )

  expect(value).toBe(22)
})

test('empty iterable returns initial value', () => {
  const {value} = scanReduceSync(
    [],
    (accumulator, item) => accumulator + item,
    42,
  )

  expect(value).toBe(42)
})

test('failFast stops on error and returns no value', () => {
  const onError = vi.fn()
  const onFailure = vi.fn()

  const {value, errors, failure} = scanReduceSync(
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

test('failLate collects errors and returns partial value', () => {
  const onFailure = vi.fn()

  const {value, errors, failure} = scanReduceSync(
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

test('throw strategy throws', () => {
  expect(() => scanReduceSync([1, 2, 3], (acc, item) => {
    if (item === 2)
      throw new Error('bang')
    return acc + item
  }, 0, {strategy: rethrow})).toThrow('bang')
})

test('default strategy is failFast', () => {
  const {value, failure} = scanReduceSync(
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

test('returns value synchronously not a promise', () => {
  const result = scanReduceSync([1, 2, 3], (acc, item) => acc + item, 0)
  expect(result).not.toBeInstanceOf(Promise)
})
