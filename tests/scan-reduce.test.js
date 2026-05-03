import {test, expect} from 'vitest'
import {scan, failFast} from '$src/functional'

test('returns final value when storePartialResults is false', async () => {
  const tracks = [
    {duration: 5},
    {duration: 7},
    {duration: 10},
  ]

  const {result: totalDuration} = await scan(
    tracks,
    (accumulator, {duration}) => accumulator + duration,
    0,
    {storePartialResults: false},
  )

  expect(totalDuration).toBe(22)
})

test('failFast stops on error with storePartialResults false', async () => {
  const tracks = [
    {duration: 5},
    {duration: 7},
    {duration: 10},
  ]

  const {result, failure, errors} = await scan(
    tracks,
    (accumulator, {duration}) => {
      if (duration > 7)
        throw new Error('Duration too long')
      return accumulator + duration
    },
    0,
    {strategy: failFast, storePartialResults: false},
  )

  expect(result).toBe(12) // 5 + 7 before error
  expect(failure).toEqual({
    item: {duration: 10},
    error: new Error('Duration too long'),
  })
  // failFast doesn't collect errors in the errors array
  expect(errors).toHaveLength(0)
})

test('failFast throws when accessing missing property', async () => {
  const tracks = [
    {duration: 5},
    {}, // Missing duration property - will cause error when trying to access it
    {duration: 10},
  ]

  const {result, failure} = await scan(
    tracks,
    (accumulator, item) => {
      // Explicitly throw on missing property to test failFast behavior
      if (item.duration === undefined)
        throw new Error('Missing duration')
      return accumulator + item.duration
    },
    0,
    {strategy: failFast, storePartialResults: false},
  )

  expect(result).toBe(5) // Only first item processed
  expect(failure.item).toEqual({})
  expect(failure.error.message).toBe('Missing duration')
})

test(
  'empty iterable returns initial value with storePartialResults false',
  async () => {
    const {result: total} = await scan(
      [],
      (accumulator, item) => accumulator + item,
      42,
      {storePartialResults: false},
    )

    expect(total).toBe(42)
  }
)

test('default behavior unchanged with storePartialResults true', async () => {
  const {results} = await scan(
    [1, 2, 3],
    (acc, item) => acc + item,
    0,
    {storePartialResults: true},
  )

  expect(results).toEqual([1, 3, 6])
})
