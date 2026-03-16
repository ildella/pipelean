import {test, expect} from 'vitest'
import {
  safeMap, skip, collect, failFast,
} from '$lib/functional'

test('safeMap: immediate call with sync function', async () => {
  const {results, errors, failure} = await safeMap(
    [1, 2, 3],
    x => x * 2
  )
  expect(results).toEqual([2, 4, 6])
  expect(errors).toEqual([])
  expect(failure).toBeNull()
})

test('safeMap: immediate call with async function', async () => {
  const {results, errors, failure} = await safeMap(
    [1, 2, 3],
    async x => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return x * 2
    }
  )
  expect(results).toEqual([2, 4, 6])
  expect(errors).toEqual([])
  expect(failure).toBeNull()
})

test('safeMap: curried usage', async () => {
  const double = safeMap(x => x * 2)
  const {results} = await double([1, 2, 3])
  expect(results).toEqual([2, 4, 6])
})

test('safeMap: receives item and index', async () => {
  const {results} = await safeMap(
    [10, 20, 30],
    (item, index) => ({item, index})
  )
  expect(results).toEqual([
    {item: 10, index: 0},
    {item: 20, index: 1},
    {item: 30, index: 2},
  ])
})

// ============================================================================
// LIMIT OPTION
// ============================================================================

test('safeMap: respects limit option (positive)', async () => {
  const {results, errors, failure} = await safeMap(
    [1, 2, 3, 4, 5],
    item => item * 10,
    {limit: 3}
  )
  expect(results).toEqual([10, 20, 30])
  expect(errors).toEqual([])
  expect(failure).toBeNull()
})

test('safeMap: limit 1 processes only first item', async () => {
  const {results} = await safeMap(
    [1, 2, 3, 4, 5],
    x => x * 10,
    {limit: 1}
  )
  expect(results).toEqual([10])
})

test('safeMap: limit 0 returns empty results', async () => {
  const {results} = await safeMap(
    [1, 2, 3, 4, 5],
    x => x * 10,
    {limit: 0}
  )
  expect(results).toEqual([])
})

test('safeMap: negative limit returns empty results', async () => {
  const {results} = await safeMap(
    [1, 2, 3, 4, 5],
    x => x * 10,
    {limit: -1}
  )
  expect(results).toEqual([])
})

test('safeMap: limit greater than array length processes all', async () => {
  const {results} = await safeMap(
    [1, 2, 3],
    x => x * 10,
    {limit: 100}
  )
  expect(results).toEqual([10, 20, 30])
})

test('safeMap: limit with async function', async () => {
  const {results} = await safeMap(
    [1, 2, 3, 4, 5],
    async x => {
      await new Promise(resolve => setTimeout(resolve, 5))
      return x * 10
    },
    {limit: 2}
  )
  expect(results).toEqual([10, 20])
})

// ============================================================================
// ERROR STRATEGIES WITH LIMIT
// ============================================================================

test('safeMap: failFast with limit stops at error', async () => {
  const {results, failure} = await safeMap(
    [1, 2, 3, 4, 5],
    x => {
      if (x === 2)
        throw new Error('error at 2')
      return x * 10
    },
    {limit: 5, onError: failFast}
  )
  expect(results).toEqual([10])
  expect(failure).not.toBeNull()
  expect(failure.item).toBe(2)
})

test('safeMap: skip with limit continues past error', async () => {
  const {results, errors} = await safeMap(
    [1, 2, 3, 4, 5],
    x => {
      if (x === 2 || x === 4)
        throw new Error(`error at ${x}`)
      return x * 10
    },
    {limit: 5, onError: skip}
  )
  expect(results).toEqual([10, 30, 50])
  expect(errors).toHaveLength(2)
})

test('safeMap: collect with limit includes error objects', async () => {
  const {results, errors} = await safeMap(
    [1, 2, 3, 4, 5],
    x => {
      if (x % 2 === 0)
        throw new Error(`even: ${x}`)
      return x * 10
    },
    {limit: 5, onError: collect}
  )
  expect(results).toEqual([10, 30, 50])
  expect(errors).toHaveLength(2)
})

test('safeMap: limit applies before error strategy evaluation', async () => {
  const {results, errors} = await safeMap(
    [1, 2, 3, 4, 5],
    x => {
      if (x > 2)
        throw new Error(`error at ${x}`)
      return x * 10
    },
    {limit: 3, onError: collect}
  )
  // Only processes first 3 items [1, 2, 3]
  expect(results).toEqual([10, 20])
  expect(errors).toHaveLength(1)
})

// ============================================================================
// EDGE CASES
// ============================================================================

test('safeMap: empty array', async () => {
  const {results, errors, failure} = await safeMap([], x => x * 2)
  expect(results).toEqual([])
  expect(errors).toEqual([])
  expect(failure).toBeNull()
})

test('safeMap: empty array with limit', async () => {
  const {results} = await safeMap([], x => x * 2, {limit: 5})
  expect(results).toEqual([])
})

test('safeMap: limit 0 with error strategy', async () => {
  const {results, errors} = await safeMap(
    [1, 2, 3],
    x => {
      if (x === 1)
        throw new Error('error')
      return x * 10
    },
    {limit: 0, onError: collect}
  )
  expect(results).toEqual([])
  expect(errors).toEqual([])
})
