import {test, expect} from 'vitest'
import {series, pipe} from '$src/functional'

const double = x => x * 2
const increment = x => x + 1
const isEven = x => x % 2 === 0

// A curried function for testing curry support
const multiplyBy = factor => x => x * factor

test('accept a pipe with a single mapping function', async () => {
  const items = [1, 2, 3]
  const operation = pipe(double)

  const result = await series(items, operation)

  expect(result).toEqual({
    results: [2, 4, 6],
    errors: [],
    failure: false,
  })
})

test('accept a pipe with multiple mapping functions', async () => {
  const items = [1, 2, 3]
  // double first, then increment: 1->2->3
  const operation = pipe(double, increment)

  const result = await series(items, operation)

  expect(result).toEqual({
    results: [3, 5, 7],
    errors: [],
    failure: false,
  })
})

test('curried functions inside the pipe', async () => {
  const items = [1, 2, 3]
  // Using the curried multiplyBy function
  const operation = pipe(increment, multiplyBy(10))

  const result = await series(items, operation)

  expect(result).toEqual({
    results: [20, 30, 40], // (1+1)*10, etc.
    errors: [],
    failure: false,
  })
})

test(
  'filter after transform in a pipe (short-circuit mid-pipe)',
  async () => {
    const items = [1, 2, 3, 4, 5, 6]

    // NOTE: double(n) is always even for integers, so the
    // filter step (drop odds) is a no-op here.
    // 1->2->3, 2->4->5, 3->6->7, 4->8->9, 5->10->11, 6->12->13
    const operation = pipe(
      double,
      x => isEven(x) ? x : undefined,
      increment,
    )

    const result = await series(items, operation)

    expect(result).toEqual({
      results: [3, 5, 7, 9, 11, 13],
      errors: [],
      failure: false,
    })
  },
)

test('mixed mapping and filtering logic within a pipe', async () => {
  const items = [1, 2, 3, 4, 5, 6]

  // Goal: Keep even numbers, double them, then increment.
  // 1 (odd) -> drop
  // 2 (even) -> 4 -> 5
  // 3 (odd) -> drop
  const operation = pipe(
    x => isEven(x) ? x : undefined, // Filter FIRST
    double,
    increment
  )

  const result = await series(items, operation)

  expect(result).toEqual({
    results: [5, 9, 13], // inputs: 2, 4, 6
    errors: [],
    failure: false,
  })
})
