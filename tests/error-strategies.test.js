/* eslint-disable max-lines */
import {test, expect, vi} from 'vitest'
import {
  failFast,
  collect,
  failLate,
  skip,
  rethrow,
  fail,
  stopOnError,
  series,
  filter,
} from '$src/functional'

test('failFast is a frozen object with name "failFast"', () => {
  expect(failFast).toEqual({name: 'failFast'})
  expect(Object.isFrozen(failFast)).toBe(true)
})

test('collect is a frozen object with name "collect"', () => {
  expect(collect).toEqual({name: 'collect'})
  expect(Object.isFrozen(collect)).toBe(true)
})

test('failLate is a frozen object with name "failLate"', () => {
  expect(failLate).toEqual({name: 'failLate'})
  expect(Object.isFrozen(failLate)).toBe(true)
})

test('skip is a frozen object with name "skip"', () => {
  expect(skip).toEqual({name: 'skip'})
  expect(Object.isFrozen(skip)).toBe(true)
})

test('fail is an alias for failFast', () => {
  expect(fail).toEqual({name: 'failFast'})
  expect(fail).toBe(failFast)
  expect(Object.isFrozen(fail)).toBe(true)
})

test('stopOnError is an alias for failFast', () => {
  expect(stopOnError).toEqual({name: 'failFast'})
  expect(stopOnError).toBe(failFast)
  expect(Object.isFrozen(stopOnError)).toBe(true)
})

test('strategies are distinct references', () => {
  expect(failFast).not.toBe(collect)
  expect(failFast).not.toBe(failLate)
  expect(failFast).not.toBe(skip)
  expect(collect).not.toBe(failLate)
  expect(collect).not.toBe(skip)
  expect(failLate).not.toBe(skip)
})

test('failLate: collects all errors and returns failure context', async () => {
  const items = [1, 2, 3, 4]
  const fn = item => {
    if (item === 2 || item === 4)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const result = await series(items, fn, {strategy: failLate})

  expect(result.results).toEqual([2, 6])
  expect(result.errors).toHaveLength(2)
  expect(result.errors[0]).toEqual({
    item: 2,
    error: new Error('Error at 2'),
    index: 1,
  })
  expect(result.errors[1]).toEqual({
    item: 4,
    error: new Error('Error at 4'),
    index: 3,
  })
  expect(result.failure).toEqual({errors: result.errors})
})

test('failLate: no errors returns failure: false', async () => {
  const items = [1, 2, 3]
  const fn = item => item * 2

  const result = await series(items, fn, {strategy: failLate})

  expect(result.results).toEqual([2, 4, 6])
  expect(result.errors).toHaveLength(0)
  expect(result.failure).toBe(false)
})

test('skip: ignores errors without collection', async () => {
  const items = [1, 2, 3, 4]
  const fn = item => {
    if (item === 2 || item === 4)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const result = await series(items, fn, {strategy: skip})

  expect(result.results).toEqual([2, 6])
  expect(result.errors).toHaveLength(0)
  expect(result.failure).toBe(false)
})

test('skip: calls onError if present', async () => {
  const onErrorCalls = []
  const items = [1, 2, 3]

  const fn = item => {
    if (item === 2)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const result = await series(items, fn, {
    strategy: skip,
    onError: error => onErrorCalls.push(error),
  })

  expect(onErrorCalls).toHaveLength(1)
  expect(onErrorCalls[0]).toEqual({
    item: 2,
    error: new Error('Error at 2'),
    index: 1,
    total: 3,
  })
  expect(result.results).toEqual([2, 6])
  expect(result.errors).toHaveLength(0)
  expect(result.failure).toBe(false)
})

test('fail alias works as failFast in series', async () => {
  const items = [1, 2, 3]
  const fn = item => {
    if (item === 2)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const result = await series(items, fn, {strategy: fail})

  expect(result.results).toEqual([])
  expect(result.errors).toHaveLength(0)
  expect(result.failure).toEqual({
    item: 2,
    error: new Error('Error at 2'),
    index: 1,
  })
})

test('stopOnError alias works as failFast in series', async () => {
  const items = [1, 2, 3]
  const fn = item => {
    if (item === 2)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const result = await series(items, fn, {strategy: stopOnError})

  expect(result.results).toEqual([])
  expect(result.errors).toHaveLength(0)
  expect(result.failure).toEqual({
    item: 2,
    error: new Error('Error at 2'),
    index: 1,
  })
})

test('failLate works with filter', async () => {
  const items = [1, 2, 3, 4, 5]
  const predicate = item => {
    if (item === 2 || item === 4)
      throw new Error(`Error at ${item}`)
    return item % 2 === 1
  }

  const result = await filter(items, predicate, {strategy: failLate})

  expect(result.results).toEqual([1, 3, 5])
  expect(result.errors).toHaveLength(2)
  expect(result.errors[0]).toEqual({
    item: 2,
    error: new Error('Error at 2'),
    index: 1,
  })
  expect(result.errors[1]).toEqual({
    item: 4,
    error: new Error('Error at 4'),
    index: 3,
  })
  expect(result.failure).toEqual({errors: result.errors})
})

test('skip works with filter', async () => {
  const items = [1, 2, 3, 4]
  const predicate = item => {
    if (item === 2 || item === 4)
      throw new Error(`Error at ${item}`)
    return item % 2 === 0
  }

  const result = await filter(items, predicate, {strategy: skip})

  expect(result.results).toEqual([]) // 2 and 4 failed
  expect(result.errors).toHaveLength(0)
  expect(result.failure).toBe(false)
})

test('failLate with series returns success before error', async () => {
  const items = [1, 2, 3, 4, 5]
  const fn = item => {
    if (item === 3)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const result = await series(items, fn, {strategy: failLate})

  // All items processed: 1, 2, 4, 5 succeed, 3 fails
  expect(result.results).toEqual([2, 4, 8, 10])
  expect(result.errors).toHaveLength(1)
  expect(result.failure).toEqual({errors: result.errors})
})

test('collect onError strategy', async () => {
  const onError = vi.fn()
  const bang = new Error('bang')
  const result = await series([1, 2, 3], item => {
    if (item === 2)
      throw bang
    return item * 10
  }, {strategy: collect, onError})

  expect(onError).toHaveBeenCalledWith({
    item: 2,
    error: bang,
    index: 1,
    total: 3,
  })
  expect(result.errors).toEqual([{item: 2, error: bang, index: 1}])
  expect(result.failure).toBe(false)
})

test('skip calls onError with context without storing errors', async () => {
  const onError = vi.fn()
  const bang = new Error('bang')
  const result = await series([1, 2, 3], item => {
    if (item === 2)
      throw bang
    return item * 10
  }, {strategy: skip, onError})

  expect(onError).toHaveBeenCalledWith({
    item: 2,
    error: bang,
    index: 1,
    total: 3,
  })
  expect(result.errors).toEqual([])
  expect(result.failure).toBe(false)
})

test('failFast calls onError and onFailure with item context', async () => {
  const onError = vi.fn()
  const onFailure = vi.fn()
  const bang = new Error('bang')
  const result = await series([1, 2, 3], item => {
    if (item === 2)
      throw bang
    return item * 10
  }, {strategy: failFast, onError, onFailure})

  expect(onError).toHaveBeenCalledWith({
    item: 2,
    error: bang,
    index: 1,
    total: 3,
  })
  expect(onFailure).toHaveBeenCalledWith({item: 2, error: bang, index: 1})
  expect(result.failure).toEqual({item: 2, error: bang, index: 1})
})

test('failLate calls onFailure with collected contextual errors', async () => {
  const onFailure = vi.fn()
  const result = await series([1, 2, 3], item => {
    if (item > 1)
      throw new Error(`Error at ${item}`)
    return item * 10
  }, {strategy: failLate, onFailure})

  expect(result.errors).toEqual([
    {item: 2, error: new Error('Error at 2'), index: 1},
    {item: 3, error: new Error('Error at 3'), index: 2},
  ])
  expect(onFailure).toHaveBeenCalledWith({errors: result.errors})
  expect(result.failure).toEqual({errors: result.errors})
})

test('throw strategy throws without calling onError or onFailure', async () => {
  const onError = vi.fn()
  const onFailure = vi.fn()
  const bang = new Error('bang')

  await expect(series([1, 2, 3], item => {
    if (item === 2)
      throw bang
    return item * 10
  }, {strategy: rethrow, onError, onFailure})).rejects.toThrow(bang)

  expect(onError).not.toHaveBeenCalled()
  expect(onFailure).not.toHaveBeenCalled()
})

test('collect strategy still works (failure: false)', async () => {
  const items = [1, 2, 3]
  const fn = item => {
    if (item === 2)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const result = await series(items, fn, {strategy: collect})

  expect(result.results).toEqual([2, 6])
  expect(result.errors).toHaveLength(1)
  expect(result.failure).toBe(false)
})
