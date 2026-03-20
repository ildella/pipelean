import {test, expect, vi} from 'vitest'
import {
  series, filter, scan, failFast, failLate, collect, skip,
} from '$src/functional'

const fnThatFailsAt = failItem => item => {
  if (item === failItem)
    throw new Error(`Error at ${item}`)
  return item * 2
}

const fnThatFailsAtItems = failItems => item => {
  if (failItems.includes(item))
    throw new Error(`Error at ${item}`)
  return item * 2
}

const predicateThatFailsAt = failItem => item => {
  if (item === failItem)
    throw new Error(`Error at ${item}`)
  return item % 2 === 0
}

const predicateThatFailsAtItems = failItems => item => {
  if (failItems.includes(item))
    throw new Error(`Error at ${item}`)
  return item % 2 === 1
}

const scannerThatFailsAt = failItem => (acc, item) => {
  if (item === failItem)
    throw new Error(`Error at ${item}`)
  return acc + item
}

test('onFailure called for failFast with {item, error}', async () => {
  const onFailure = vi.fn()
  const items = [1, 2, 3]

  const result = await series(items, fnThatFailsAt(2), {
    strategy: failFast,
    onFailure,
  })

  expect(onFailure).toHaveBeenCalledTimes(1)
  expect(onFailure).toHaveBeenCalledWith({
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
  const onFailure = vi.fn()
  const items = [1, 2, 3, 4]

  const result = await series(items, fnThatFailsAtItems([2, 4]), {
    strategy: failLate,
    onFailure,
  })

  expect(onFailure).toHaveBeenCalledTimes(1)
  expect(onFailure).toHaveBeenCalledWith(true)
  expect(result.failure).toBe(true)
  expect(result.results).toEqual([2, 6])
  expect(result.errors).toHaveLength(2)
})

test('onFailure NOT called for collect (failure: null)', async () => {
  const onFailure = vi.fn()
  const items = [1, 2, 3]

  const result = await series(items, fnThatFailsAt(2), {
    strategy: collect,
    onFailure,
  })

  expect(onFailure).not.toHaveBeenCalled()
  expect(result.failure).toBe(null)
  expect(result.results).toEqual([2, 6])
  expect(result.errors).toHaveLength(1)
})

test('onFailure NOT called for skip (failure: null)', async () => {
  const onFailure = vi.fn()
  const items = [1, 2, 3]

  const result = await series(items, fnThatFailsAt(2), {
    strategy: skip,
    onFailure,
  })

  expect(onFailure).not.toHaveBeenCalled()
  expect(result.failure).toBe(null)
  expect(result.results).toEqual([2, 6])
  expect(result.errors).toHaveLength(0)
})

test('onFailure is optional', async () => {
  const items = [1, 2, 3]

  // Should not throw without onFailure
  const result = await series(items, fnThatFailsAt(2), {strategy: failFast})

  expect(result.failure).toEqual({
    item: 2,
    error: new Error('Error at 2'),
  })
})

test('onFailure works with filter', async () => {
  const onFailure = vi.fn()
  const items = [1, 2, 3, 4]

  const result = await filter(items, predicateThatFailsAt(3), {
    strategy: failFast,
    onFailure,
  })

  expect(onFailure).toHaveBeenCalledTimes(1)
  expect(onFailure).toHaveBeenCalledWith({
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
  const onFailure = vi.fn()
  const items = [1, 2, 3, 4, 5]

  const result = await filter(items, predicateThatFailsAtItems([2, 4]), {
    strategy: failLate,
    onFailure,
  })

  expect(onFailure).toHaveBeenCalledTimes(1)
  expect(onFailure).toHaveBeenCalledWith(true)
  expect(result.failure).toBe(true)
  expect(result.results).toEqual([1, 3, 5])
  expect(result.errors).toHaveLength(2)
})

test('onFailure works with scan', async () => {
  const onFailure = vi.fn()
  const items = [1, 2, 3]

  const result = await scan(items, scannerThatFailsAt(2), 0, {
    strategy: failFast,
    onFailure,
  })

  expect(onFailure).toHaveBeenCalledTimes(1)
  expect(onFailure).toHaveBeenCalledWith({
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
  const opts = withDefaultOnFailure(fnThatFailsAt(2), {strategy: failFast})
  const result = await series(items, fnThatFailsAt(2), opts)

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
  const onError = vi.fn()
  const onFailure = vi.fn()
  const items = [1, 2, 3]

  const result = await series(items, fnThatFailsAt(2), {
    strategy: skip,
    onError,
    onFailure,
  })

  // onError should be called even with skip
  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError).toHaveBeenCalledWith(new Error('Error at 2'))

  // onFailure should NOT be called (failure is null)
  expect(onFailure).not.toHaveBeenCalled()
  expect(result.failure).toBe(null)
  expect(result.errors).toHaveLength(0)
  expect(result.results).toEqual([2, 6])
})
