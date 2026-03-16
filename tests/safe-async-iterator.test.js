import {test, expect} from 'vitest'
import {
  safeAsyncIterator, failFast, skip, collect, unwrapIterator,
} from '$lib/functional'

test('safeAsyncIterator: yields transformed items', async () => {
  async function * source () {
    yield 1
    yield 2
    yield 3
  }

  const iterator = safeAsyncIterator(source(), x => x * 2)
  const results = await unwrapIterator(iterator)
  expect(results).toEqual([2, 4, 6])
})

test('safeAsyncIterator: works with async transform', async () => {
  async function * source () {
    yield 1
    yield 2
    yield 3
  }

  const iterator = safeAsyncIterator(
    source(),
    async x => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return x * 2
    }
  )
  const results = await unwrapIterator(iterator)
  expect(results).toEqual([2, 4, 6])
})

test('safeAsyncIterator: works with arrays', async () => {
  const iterator = safeAsyncIterator([1, 2, 3], x => x + 10)
  const results = await unwrapIterator(iterator)
  expect(results).toEqual([11, 12, 13])
})

// ============================================================================
// ERROR HANDLING - failFast
// ============================================================================

test('safeAsyncIterator: failFast throws on first error', async () => {
  async function * source () {
    yield 1
    yield 2
    yield 3
  }

  const iterator = safeAsyncIterator(
    source(),
    x => {
      if (x === 2)
        throw new Error('error at 2')
      return x * 2
    },
    {onError: failFast}
  )

  const results = []
  let error = null
  try {
    for await (const item of iterator) {
      results.push(item)
    }
  } catch (e) {
    error = e
  }

  expect(results).toEqual([2])
  expect(error).not.toBeNull()
  expect(error.message).toBe('error at 2')
})

test('safeAsyncIterator: failFast with async transform', async () => {
  async function * source () {
    yield 1
    yield 2
    yield 3
  }

  const iterator = safeAsyncIterator(
    source(),
    async x => {
      if (x === 2)
        throw new Error('async error')
      return x * 2
    },
    {onError: failFast}
  )

  const results = []
  let error = null
  try {
    for await (const item of iterator) {
      results.push(item)
    }
  } catch (e) {
    error = e
  }

  expect(results).toEqual([2])
  expect(error.message).toBe('async error')
})

// ============================================================================
// ERROR HANDLING - skip
// ============================================================================

test('safeAsyncIterator: skip continues on error', async () => {
  async function * source () {
    yield 1
    yield 2
    yield 3
    yield 4
  }

  const iterator = safeAsyncIterator(
    source(),
    x => {
      if (x === 2 || x === 4)
        throw new Error('skip this')
      return x * 2
    },
    {onError: skip}
  )

  const results = await unwrapIterator(iterator)
  expect(results).toEqual([2, 6])
})

test('safeAsyncIterator: skip with async transform', async () => {
  async function * source () {
    yield 1
    yield 2
    yield 3
  }

  const iterator = safeAsyncIterator(
    source(),
    async x => {
      if (x === 2)
        throw new Error('skip')
      return x * 10
    },
    {onError: skip}
  )

  const results = await unwrapIterator(iterator)
  expect(results).toEqual([10, 30])
})

// ============================================================================
// ERROR HANDLING - collect
// ============================================================================

test('safeAsyncIterator: collect yields error objects', async () => {
  async function * source () {
    yield 1
    yield 2
    yield 3
  }

  const iterator = safeAsyncIterator(
    source(),
    x => {
      if (x === 2)
        throw new Error('error at 2')
      return x * 2
    },
    {onError: collect}
  )

  const results = await unwrapIterator(iterator)
  expect(results).toHaveLength(3)
  expect(results[0]).toBe(2)
  expect(results[1]).toEqual({error: expect.any(Error), item: 2})
  expect(results[1].error.message).toBe('error at 2')
  expect(results[2]).toBe(6)
})

test('safeAsyncIterator: collect multiple errors', async () => {
  async function * source () {
    yield 1
    yield 2
    yield 3
    yield 4
  }

  const iterator = safeAsyncIterator(
    source(),
    x => {
      if (x % 2 === 0)
        throw new Error(`error at ${x}`)
      return x * 10
    },
    {onError: collect}
  )

  const results = await unwrapIterator(iterator)
  expect(results).toHaveLength(4)
  expect(results[0]).toBe(10)
  expect(results[1]).toEqual({error: expect.any(Error), item: 2})
  expect(results[2]).toBe(30)
  expect(results[3]).toEqual({error: expect.any(Error), item: 4})
})

// ============================================================================
// LAZY EVALUATION (core generator benefit)
// ============================================================================

test('safeAsyncIterator: lazy evaluation - stops early', async () => {
  const calls = []
  async function * source () {
    for (let i = 1; i <= 10; i++) {
      calls.push(i)
      yield i
    }
  }

  const iterator = safeAsyncIterator(source(), x => x * 2)

  const results = []
  let count = 0
  for await (const item of iterator) {
    results.push(item)
    count += 1
    if (count === 3)
      break
  }

  expect(results).toEqual([2, 4, 6])
  expect(calls).toEqual([1, 2, 3])
})

test('safeAsyncIterator: lazy evaluation with map then filter pattern', async () => {
  async function * source () {
    yield 1
    yield 2
    yield 3
    yield 4
    yield 5
  }

  const mapped = safeAsyncIterator(source(), x => x * 2)
  const filtered = safeAsyncIterator(
    mapped,
    x => x > 4 ? x : undefined
  )

  const results = []
  for await (const item of filtered) {
    if (item !== undefined)
      results.push(item)
  }

  expect(results).toEqual([6, 8, 10])
})

// ============================================================================
// PRACTICAL SCENARIOS
// ============================================================================

test('safeAsyncIterator: processing file-like stream with enrichment', async () => {
  async function * fileStream () {
    yield {id: 1, name: 'file1.txt'}
    yield {id: 2, name: 'file2.txt'}
    yield {id: 3, name: 'file3.txt'}
  }

  const mockFetchMetadata = async id => {
    if (id === 2)
      throw new Error('API error')
    return {id, size: id * 100}
  }

  const enriched = safeAsyncIterator(
    fileStream(),
    async item => ({
      ...item,
      meta: await mockFetchMetadata(item.id),
    }),
    {onError: collect}
  )

  const results = await unwrapIterator(enriched)
  expect(results).toHaveLength(3)
  expect(results[0]).toEqual({id: 1, name: 'file1.txt', meta: {id: 1, size: 100}})
  expect(results[1]).toEqual({error: expect.any(Error), item: {id: 2, name: 'file2.txt'}})
  expect(results[2]).toEqual({id: 3, name: 'file3.txt', meta: {id: 3, size: 300}})
})

test('safeAsyncIterator: can be composed with filter', async () => {
  async function * source () {
    yield 1
    yield 2
    yield 3
    yield 4
    yield 5
  }

  const mapped = safeAsyncIterator(source(), x => x * 2)

  const results = []
  for await (const item of mapped) {
    if (item > 4)
      results.push(item)
  }

  expect(results).toEqual([6, 8, 10])
})

test('safeAsyncIterator: default error strategy is failFast', async () => {
  async function * source () {
    yield 1
    yield 2
    yield 3
  }

  const iterator = safeAsyncIterator(
    source(),
    x => {
      if (x === 2)
        throw new Error('error')
      return x * 2
    }
  )

  const results = []
  let error = null
  try {
    for await (const item of iterator) {
      results.push(item)
    }
  } catch (e) {
    error = e
  }

  expect(results).toEqual([2])
  expect(error).not.toBeNull()
})
