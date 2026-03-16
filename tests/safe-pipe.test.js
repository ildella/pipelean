import {test, expect} from 'vitest'
import {
  safePipe, safeMap, safeFilter, skip,
} from '$lib/functional'

test('chains two safeMap steps threading results through', async () => {
  const pipeline = safePipe(
    safeMap(x => x * 2),
    safeMap(x => x + 1),
  )
  const result = await pipeline([1, 2, 3])
  expect(result).toEqual({results: [3, 5, 7], errors: [], failure: null})
})

test('errors from all steps merge into single errors array', async () => {
  const bang1 = new Error('step1')
  const bang2 = new Error('step2')
  const pipeline = safePipe(
    safeMap(x => {
      if (x === 2)
        throw bang1
      return x
    }, {onError: skip}),
    safeMap(x => {
      if (x === 3)
        throw bang2
      return x * 10
    }, {onError: skip}),
  )
  const result = await pipeline([1, 2, 3])
  expect(result.results).toEqual([10])
  expect(result.errors).toEqual([
    {item: 2, error: bang1},
    {item: 3, error: bang2},
  ])
  expect(result.failure).toBeNull()
})

test('failure in step 1 skips step 2 and returns failure', async () => {
  const bang = new Error('boom')
  const step2Called = []
  const pipeline = safePipe(
    safeMap(x => {
      if (x === 2)
        throw bang
      return x
    }),
    safeMap(x => {
      step2Called.push(x)
      return x
    }),
  )
  const result = await pipeline([1, 2, 3])
  expect(result.failure).toEqual({item: 2, error: bang})
  expect(result.results).toEqual([1])
  expect(step2Called).toEqual([])
})

test('works with mixed safeMap and safeFilter steps', async () => {
  const pipeline = safePipe(
    safeMap(x => x * 2),
    safeFilter(x => x > 3),
  )
  const result = await pipeline([1, 2, 3])
  expect(result).toEqual({results: [4, 6], errors: [], failure: null})
})

test('single step pipeline', async () => {
  const pipeline = safePipe(
    safeMap(x => x + 1),
  )
  const result = await pipeline([10, 20])
  expect(result).toEqual({results: [11, 21], errors: [], failure: null})
})

test('empty pipeline returns items as results', async () => {
  const pipeline = safePipe()
  const result = await pipeline([1, 2, 3])
  expect(result).toEqual({results: [1, 2, 3], errors: [], failure: null})
})
