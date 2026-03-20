import {test, expect} from 'vitest'
import {
  series, filter, scan, failFast, failLate, collect, skip,
} from '$src/functional'

test('onFailure called for failFast with {item, error}', async () => {
  const onFailureCalls = []
  const items = [1, 2, 3]

  const fn = item => {
    if (item === 2)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const result = await series(items, fn, {
    strategy: failFast,
    onFailure: failure => onFailureCalls.push(failure),
  })

  expect(onFailureCalls).toHaveLength(1)
  expect(onFailureCalls[0]).toEqual({
    item: 2,
    error: new Error('Error at 2'),
  })
  expect(result.failure).toEqual({
    item: 2,
    error: new Error('Error at 2'),
  })
  expect(result.results).toEqual([2])
})

test('onFailure called for failLate with true', async () => {
  const onFailureCalls = []
  const items = [1, 2, 3, 4]

  const fn = item => {
    if (item === 2 || item === 4)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const result = await series(items, fn, {
    strategy: failLate,
    onFailure: failure => onFailureCalls.push(failure),
  })

  expect(onFailureCalls).toHaveLength(1)
  expect(onFailureCalls[0]).toBe(true)
  expect(result.failure).toBe(true)
  expect(result.results).toEqual([2, 6])
  expect(result.errors).toHaveLength(2)
})

test('onFailure NOT called for collect (failure: null)', async () => {
  const onFailureCalls = []
  const items = [1, 2, 3]

  const fn = item => {
    if (item === 2)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const result = await series(items, fn, {
    strategy: collect,
    onFailure: failure => onFailureCalls.push(failure),
  })

  expect(onFailureCalls).toHaveLength(0)
  expect(result.failure).toBe(null)
  expect(result.results).toEqual([2, 6])
  expect(result.errors).toHaveLength(1)
})

test('onFailure NOT called for skip (failure: null)', async () => {
  const onFailureCalls = []
  const items = [1, 2, 3]

  const fn = item => {
    if (item === 2)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const result = await series(items, fn, {
    strategy: skip,
    onFailure: failure => onFailureCalls.push(failure),
  })

  expect(onFailureCalls).toHaveLength(0)
  expect(result.failure).toBe(null)
  expect(result.results).toEqual([2, 6])
  expect(result.errors).toHaveLength(0)
})

test('onFailure is optional', async () => {
  const items = [1, 2, 3]

  const fn = item => {
    if (item === 2)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  // Should not throw without onFailure
  const result = await series(items, fn, {strategy: failFast})

  expect(result.failure).toEqual({
    item: 2,
    error: new Error('Error at 2'),
  })
})

test('onFailure works with filter', async () => {
  const onFailureCalls = []
  const items = [1, 2, 3, 4]

  const predicate = item => {
    if (item === 3)
      throw new Error(`Error at ${item}`)
    return item % 2 === 0
  }

  const result = await filter(items, predicate, {
    strategy: failFast,
    onFailure: failure => onFailureCalls.push(failure),
  })

  expect(onFailureCalls).toHaveLength(1)
  expect(onFailureCalls[0]).toEqual({
    item: 3,
    error: new Error('Error at 3'),
  })
  expect(result.failure).toEqual({
    item: 3,
    error: new Error('Error at 3'),
  })
  expect(result.results).toEqual([2])
})

test('onFailure works with filter and failLate', async () => {
  const onFailureCalls = []
  const items = [1, 2, 3, 4, 5]

  const predicate = item => {
    if (item === 2 || item === 4)
      throw new Error(`Error at ${item}`)
    return item % 2 === 1
  }

  const result = await filter(items, predicate, {
    strategy: failLate,
    onFailure: failure => onFailureCalls.push(failure),
  })

  expect(onFailureCalls).toHaveLength(1)
  expect(onFailureCalls[0]).toBe(true)
  expect(result.failure).toBe(true)
  expect(result.results).toEqual([1, 3, 5])
  expect(result.errors).toHaveLength(2)
})

test('onFailure works with scan', async () => {
  const onFailureCalls = []
  const items = [1, 2, 3]

  const scanner = (acc, item) => {
    if (item === 2)
      throw new Error(`Error at ${item}`)
    return acc + item
  }

  const result = await scan(items, scanner, 0, {
    strategy: failFast,
    onFailure: failure => onFailureCalls.push(failure),
  })

  expect(onFailureCalls).toHaveLength(1)
  expect(onFailureCalls[0]).toEqual({
    item: 2,
    error: new Error('Error at 2'),
  })
  expect(result.failure).toEqual({
    item: 2,
    error: new Error('Error at 2'),
  })
  expect(result.results).toEqual([1])
})

test('Application-layer wrapper with default onFailure', async () => {
  // Simulating an application-layer wrapper
  let lastFailure = null

  const withDefaultOnFailure = (fn, opts) => ({
    ...opts,
    onFailure: failure => {
      lastFailure = failure
      // Could trigger UI update, notification, etc.
      if (opts.onFailure) {
        opts.onFailure(failure)
      }
    },
  })

  const items = [1, 2, 3]
  const fn = item => {
    if (item === 2)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const opts = withDefaultOnFailure(fn, {strategy: failFast})
  const result = await series(items, fn, opts)

  expect(lastFailure).toEqual({
    item: 2,
    error: new Error('Error at 2'),
  })
  expect(result.failure).toEqual({
    item: 2,
    error: new Error('Error at 2'),
  })
})

test('onFailure with skip strategy still allows onError', async () => {
  const onErrorCalls = []
  const onFailureCalls = []
  const items = [1, 2, 3]

  const fn = item => {
    if (item === 2)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const result = await series(items, fn, {
    strategy: skip,
    onError: error => onErrorCalls.push(error),
    onFailure: failure => onFailureCalls.push(failure),
  })

  // onError should be called even with skip
  expect(onErrorCalls).toHaveLength(1)
  expect(onErrorCalls[0]).toEqual(new Error('Error at 2'))

  // onFailure should NOT be called (failure is null)
  expect(onFailureCalls).toHaveLength(0)
  expect(result.failure).toBe(null)
  expect(result.errors).toHaveLength(0)
  expect(result.results).toEqual([2, 6])
})
