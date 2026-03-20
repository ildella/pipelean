import {test, expect} from 'vitest'
import {
  failFast,
  collect,
  failLate,
  skip,
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

test('failLate: collects all errors and returns failure: true', async () => {
  const items = [1, 2, 3, 4]
  const fn = item => {
    if (item === 2 || item === 4)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const result = await series(items, fn, {strategy: failLate})

  expect(result.results).toEqual([2, 6])
  expect(result.errors).toHaveLength(2)
  expect(result.errors[0]).toEqual({item: 2, error: new Error('Error at 2')})
  expect(result.errors[1]).toEqual({item: 4, error: new Error('Error at 4')})
  expect(result.failure).toBe(true)
})

test('failLate: no errors returns failure: null', async () => {
  const items = [1, 2, 3]
  const fn = item => item * 2

  const result = await series(items, fn, {strategy: failLate})

  expect(result.results).toEqual([2, 4, 6])
  expect(result.errors).toHaveLength(0)
  expect(result.failure).toBe(null)
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
  expect(result.failure).toBe(null)
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
  expect(onErrorCalls[0]).toEqual(new Error('Error at 2'))
  expect(result.results).toEqual([2, 6])
  expect(result.errors).toHaveLength(0)
  expect(result.failure).toBe(null)
})

test('fail alias works as failFast in series', async () => {
  const items = [1, 2, 3]
  const fn = item => {
    if (item === 2)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const result = await series(items, fn, {strategy: fail})

  expect(result.results).toEqual([2])
  expect(result.errors).toHaveLength(0)
  expect(result.failure).toEqual({
    item: 2,
    error: new Error('Error at 2'),
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

  expect(result.results).toEqual([2])
  expect(result.errors).toHaveLength(0)
  expect(result.failure).toEqual({
    item: 2,
    error: new Error('Error at 2'),
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
  expect(result.errors[0]).toEqual({item: 2, error: new Error('Error at 2')})
  expect(result.errors[1]).toEqual({item: 4, error: new Error('Error at 4')})
  expect(result.failure).toBe(true)
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
  expect(result.failure).toBe(null)
})

test('failLate with series returns all successful results before any error', async () => {
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
  expect(result.failure).toBe(true)
})

test('collect strategy still works (failure: null)', async () => {
  const items = [1, 2, 3]
  const fn = item => {
    if (item === 2)
      throw new Error(`Error at ${item}`)
    return item * 2
  }

  const result = await series(items, fn, {strategy: collect})

  expect(result.results).toEqual([2, 6])
  expect(result.errors).toHaveLength(1)
  expect(result.failure).toBe(null)
})
