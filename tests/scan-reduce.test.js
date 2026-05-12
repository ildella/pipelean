import {test, expect} from 'vitest'
import {scan} from '$src/functional'

test('returns final value when storePartialResults is false', async () => {
  const tracks = [
    {duration: 5},
    {duration: 7},
    {duration: 10},
  ]

  const {value: totalDuration} = await scan(
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

  const {value, failure, errors} = await scan(
    tracks,
    (accumulator, {duration}) => {
      if (duration > 7)
        throw new Error('Duration too long')
      return accumulator + duration
    },
    0,
    {storePartialResults: false},
  )

  expect(value).toBeUndefined()
  expect(failure).toEqual({
    item: {duration: 10},
    error: new Error('Duration too long'),
    index: 2,
  })
  expect(errors).toHaveLength(0)
})

test('failFast returns no value when accessing missing property', async () => {
  const tracks = [
    {duration: 5},
    {},
    {duration: 10},
  ]

  const {value, failure, errors} = await scan(
    tracks,
    (accumulator, item) => {
      if (item.duration === undefined)
        throw new Error('Missing duration')
      return accumulator + item.duration
    },
    0,
    {storePartialResults: false},
  )

  expect(value).toBeUndefined()
  expect(failure.item).toEqual({})
  expect(failure.error.message).toBe('Missing duration')
  expect(failure.index).toBe(1)
  expect(errors).toEqual([])
})

test(
  'empty iterable returns initial value with storePartialResults false',
  async () => {
    const {value: total} = await scan(
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
