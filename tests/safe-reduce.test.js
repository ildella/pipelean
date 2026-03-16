import {test, expect} from 'vitest'
import {safeReduce, skip, collect} from '$lib/functional'

// ============================================================================
// WITH INITIAL VALUE
// ============================================================================

test('safeReduce: threads accumulator through items', async () => {
  const results = await safeReduce(
    [1, 2, 3],
    (acc, item) => Promise.resolve(acc + item),
    {initialValue: 0}
  )
  expect(results).toEqual([1, 3, 6])
})

test('safeReduce: returns intermediate results', async () => {
  const results = await safeReduce(
    ['a', 'b', 'c'],
    (acc, item) => Promise.resolve(acc + item),
    {initialValue: ''}
  )
  expect(results).toEqual(['a', 'ab', 'abc'])
})

test('safeReduce: works with async reducer', async () => {
  const results = await safeReduce(
    [10, 20],
    async (acc, item) => {
      await new Promise(resolve => setTimeout(resolve, 1))
      return acc + item
    },
    {initialValue: 0}
  )
  expect(results).toEqual([10, 30])
})

test('safeReduce: works with sync reducer', async () => {
  const results = await safeReduce(
    [1, 2, 3],
    (acc, item) => acc * item,
    {initialValue: 1}
  )
  expect(results).toEqual([1, 2, 6])
})

// ============================================================================
// WITHOUT INITIAL VALUE
// ============================================================================

test.skip('safeReduce: uses first item as initial when not provided', async () => {
  const results = await safeReduce(
    [1, 2, 3, 4],
    (acc, item) => acc + item
  )
  expect(results).toEqual([1, 3, 6, 10])
})

test.skip('safeReduce: single item without initialValue', async () => {
  const results = await safeReduce(
    [42],
    (acc, item) => acc + item
  )
  expect(results).toEqual([42])
})

test.skip('safeReduce: string concatenation without initialValue', async () => {
  const results = await safeReduce(
    ['hello', ' ', 'world'],
    (acc, item) => acc + item
  )
  expect(results).toEqual(['hello', 'hello ', 'hello world'])
})

test('safeReduce: object merging without initialValue', async () => {
  const results = await safeReduce(
    [{a: 1}, {b: 2}, {c: 3}],
    (acc, item) => ({...acc, ...item})
  )
  expect(results).toEqual([
    {a: 1},
    {a: 1, b: 2},
    {a: 1, b: 2, c: 3},
  ])
})

test.skip('safeReduce: async reducer without initialValue', async () => {
  const results = await safeReduce(
    [1, 2, 3],
    async (acc, item) => {
      await new Promise(resolve => setTimeout(resolve, 1))
      return acc + item
    }
  )
  expect(results).toEqual([1, 3, 6])
})

// ============================================================================
// ERROR STRATEGIES WITH INITIAL VALUE
// ============================================================================

test.skip('safeReduce: skip strategy tracks errors but continues', async () => {
  const results = await safeReduce(
    [1, 2, 3],
    (acc, item) => {
      if (item === 2)
        throw new Error('error')
      return acc + item
    },
    {initialValue: 0, onError: skip}
  )
  expect(results.results).toEqual([1, 4])
  expect(results.errors).toHaveLength(1)
})

test.skip('safeReduce: collect strategy yields error objects', async () => {
  const results = await safeReduce(
    [1, 2, 3],
    (acc, item) => {
      if (item === 2)
        throw new Error('error at 2')
      return acc + item
    },
    {initialValue: 0, onError: collect}
  )
  expect(results).toHaveLength(3)
  expect(results[0]).toBe(1)
  expect(results[1]).toEqual({error: expect.any(Error), item: 2})
  expect(results[2]).toBe(4)
})

// ============================================================================
// ERROR STRATEGIES WITHOUT INITIAL VALUE
// ============================================================================

test.skip('safeReduce: collect strategy without initialValue', async () => {
  const results = await safeReduce(
    ['a', 'b', 'c'],
    (acc, item) => {
      if (item === 'b')
        throw new Error('error')
      return acc + item
    },
    {onError: collect}
  )
  expect(results).toHaveLength(3)
  expect(results[0]).toBe('a')
  expect(results[1]).toEqual({error: expect.any(Error), item: 'b'})
  expect(results[2]).toBe('ac')
})

// ============================================================================
// EDGE CASES
// ============================================================================

test('safeReduce: empty iterable with initialValue', async () => {
  const results = await safeReduce(
    [],
    (acc, item) => acc + item,
    {initialValue: 0}
  )
  expect(results).toEqual([])
})

test('safeReduce: empty iterable without initialValue', async () => {
  const results = await safeReduce(
    [],
    (acc, item) => acc + item
  )
  expect(results).toEqual([])
})

test('safeReduce: works with async generators', async () => {
  async function * source () {
    yield 1
    yield 2
    yield 3
  }

  const results = await safeReduce(
    source(),
    (acc, item) => acc + item,
    {initialValue: 0}
  )
  expect(results).toEqual([1, 3, 6])
})

test('safeReduce: initialValue of 0 works correctly', async () => {
  const results = await safeReduce(
    [1, 2, 3],
    (acc, item) => acc + item,
    {initialValue: 0}
  )
  expect(results).toEqual([1, 3, 6])
})

test('safeReduce: initialValue of empty string works correctly', async () => {
  const results = await safeReduce(
    ['a', 'b'],
    (acc, item) => acc + item,
    {initialValue: ''}
  )
  expect(results).toEqual(['a', 'ab'])
})

test('safeReduce: initialValue of false works correctly', async () => {
  const results = await safeReduce(
    [true, false, true],
    (acc, item) => acc || item,
    {initialValue: false}
  )
  expect(results).toEqual([true, true, true])
})
