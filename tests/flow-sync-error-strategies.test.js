import {test, expect} from 'vitest'
import {
  failFast, failLate, flowSync, rethrow, skip,
} from '$src/index'

test('skip strategy ignores errors and continues', () => {
  const {value, errors, failure} = flowSync([
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

test('failFast stops and preserves partial value', () => {
  const {value, errors, failure} = flowSync([
    () => ({a: 1}),
    () => {
      throw new Error('stop')
    },
    () => ({b: 2}),
  ], {strategy: failFast})({})

  expect(value).toEqual({a: 1})
  expect(errors).toEqual([])
  expect(failure.operation).toBe('operation-1')
})

test('failLate collects errors and signals failure at end', () => {
  const {value, errors, failure} = flowSync([
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

test('rethrow throws the original error', () => {
  expect(() =>
    flowSync([
      () => ({a: 1}),
      () => {
        throw new Error('kaboom')
      },
    ], {strategy: rethrow})({})).toThrow('kaboom')
})
