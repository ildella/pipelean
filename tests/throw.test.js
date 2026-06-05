import {test, expect} from 'vitest'
import {
  rethrow, series, scan, filter,
} from '$src/functional'

test('rethrow is a frozen object with name "throw"', () => {
  expect(rethrow).toEqual({name: 'throw'})
  expect(Object.isFrozen(rethrow)).toBe(true)
})

test('throw strategy throws on first error in series', async () => {
  const items = [1, 2, 3]
  const fn = item => {
    if (item === 2)
      throw new Error('Error at 2')
    return item * 2
  }

  await expect(
    series(items, fn, {strategy: rethrow}),
  ).rejects.toThrow('Error at 2')
})

test('throw strategy returns normal shape on success in series', async () => {
  const items = [1, 2, 3]
  const fn = item => item * 2

  const result = await series(items, fn, {strategy: rethrow})

  expect(result.results).toEqual([2, 4, 6])
  expect(result.errors).toEqual([])
  expect(result.failure).toBe(false)
})

test('throw strategy throws on first error in scan', async () => {
  const items = [1, 2, 3]
  const fn = (acc, item) => {
    if (item === 2)
      throw new Error('Error at 2')
    return acc + item
  }

  await expect(
    scan(items, fn, 0, {strategy: rethrow}),
  ).rejects.toThrow('Error at 2')
})

test('throw strategy returns normal shape on success in scan', async () => {
  const items = [1, 2, 3]

  const result = await scan(items, (acc, item) => acc + item, 0, {
    strategy: rethrow,
  })

  expect(result.results).toEqual([1, 3, 6])
  expect(result.errors).toEqual([])
  expect(result.failure).toBe(false)
})

test('throw strategy throws on first error in filter', async () => {
  const items = [1, 2, 3]
  const predicate = item => {
    if (item === 2)
      throw new Error('Error at 2')
    return item % 2 === 1
  }

  await expect(
    filter(items, predicate, {strategy: rethrow}),
  ).rejects.toThrow('Error at 2')
})

test('throw strategy returns normal shape on success in filter', async () => {
  const items = [1, 2, 3]
  const predicate = item => item % 2 === 1

  const result = await filter(items, predicate, {strategy: rethrow})

  expect(result.results).toEqual([1, 3])
  expect(result.errors).toEqual([])
  expect(result.failure).toBe(false)
})
