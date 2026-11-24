import {test, expect} from 'vitest'
import {series, pipe} from '$src/functional'

const double = x => x * 2
const increment = x => x + 1
const isEven = x => x % 2 === 0

const multiplyBy = factor => x => x * factor

test('accept a pipe with a single mapping function', async () => {
  const items = [1, 2, 3]
  const operation = pipe(double)

  const result = await series(items, operation)

  expect(result).toEqual({
    results: [2, 4, 6],
    errors: [],
    sourceErrors: [],
    failure: false,
  })
})

test('accept a pipe with multiple mapping functions', async () => {
  const items = [1, 2, 3]
  const operation = pipe(double, increment)

  const result = await series(items, operation)

  expect(result).toEqual({
    results: [3, 5, 7],
    errors: [],
    sourceErrors: [],
    failure: false,
  })
})

test('curried functions inside the pipe', async () => {
  const items = [1, 2, 3]
  const operation = pipe(increment, multiplyBy(10))

  const result = await series(items, operation)

  expect(result).toEqual({
    results: [20, 30, 40],
    errors: [],
    sourceErrors: [],
    failure: false,
  })
})

test(
  'filter after transform in a pipe (short-circuit mid-pipe)',
  async () => {
    const items = [1, 2, 3, 4, 5, 6]

    const operation = pipe(
      double,
      x => isEven(x) ? x : undefined,
      increment,
    )

    const result = await series(items, operation)

    expect(result).toEqual({
      results: [3, 5, 7, 9, 11, 13],
      errors: [],
      sourceErrors: [],
      failure: false,
    })
  },
)

test('mixed mapping and filtering logic within a pipe', async () => {
  const items = [1, 2, 3, 4, 5, 6]

  const operation = pipe(
    x => isEven(x) ? x : undefined,
    double,
    increment
  )

  const result = await series(items, operation)

  expect(result).toEqual({
    results: [5, 9, 13],
    errors: [],
    sourceErrors: [],
    failure: false,
  })
})
