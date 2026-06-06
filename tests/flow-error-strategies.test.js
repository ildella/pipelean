import {test, expect} from 'vitest'
import {
  failFast, failLate, flow, rethrow, skip,
} from '$src/functional'

test('skip strategy ignores errors and continues', async () => {
  const {value, errors, failure} = await flow([
    () => ({a: 1}),
    () => {
      throw new Error('skip me')
    },
    state => ({b: state.a + 1}),
  ], {strategy: skip})({})

  expect(value).toEqual({a: 1, b: 2})
  expect(errors).toEqual([])
  expect(failure).toBe(false)
})

test('failFast stops and preserves partial value', async () => {
  const {value, errors, failure} = await flow([
    () => ({a: 1}),
    () => {
      throw new Error('stop')
    },
    () => ({b: 2}),
  ], {strategy: failFast})({})

  expect(value).toEqual({a: 1})
  expect(errors).toEqual([])
  expect(failure).toEqual({
    operation: 'operation-1',
    error: new Error('stop'),
    index: 1,
  })
})

test('failLate collects errors and signals failure at end', async () => {
  const {value, errors, failure} = await flow([
    () => ({a: 1}),
    () => {
      throw new Error('e1')
    },
    state => ({b: state.a + 1}),
    () => {
      throw new Error('e2')
    },
  ], {strategy: failLate})({})

  expect(value).toEqual({a: 1, b: 2})
  expect(errors).toHaveLength(2)
  expect(failure).toEqual({errors})
})

test('rethrow throws the original error', async () => {
  await expect(
    flow([
      () => ({a: 1}),
      () => {
        throw new Error('kaboom')
      },
    ], {strategy: rethrow})({}),
  ).rejects.toThrow('kaboom')
})
