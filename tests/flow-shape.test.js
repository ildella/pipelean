import {test, expect} from 'vitest'
import {
  failFast, failLate, flow,
} from '$src/functional'

test('normalized errors shape', async () => {
  const {errors} = await flow([
    () => {
      throw new Error('e')
    },
  ])({})

  expect(errors[0]).toEqual({
    operation: 'operation-0',
    error: new Error('e'),
    index: 0,
  })
})

test('normalized failure shape for failFast', async () => {
  const {failure} = await flow([
    () => ({a: 1}),
    function namedOp () {
      throw new Error('fail')
    },
  ], {strategy: failFast})({})

  expect(failure.operation).toBe('namedOp')
  expect(failure.error).toBeInstanceOf(Error)
  expect(failure.index).toBe(1)
})

test('normalized failure shape for failLate', async () => {
  const {failure} = await flow([
    () => {
      throw new Error('e1')
    },
    () => {
      throw new Error('e2')
    },
  ], {strategy: failLate})({})

  expect(failure.errors).toHaveLength(2)
  expect(failure.errors[0].operation).toBe('operation-0')
  expect(failure.errors[1].operation).toBe('operation-1')
})

test('named operation uses function.name', async () => {
  const {errors} = await flow([
    function extractYear () {
      throw new Error('fail')
    },
  ])({})

  expect(errors[0].operation).toBe('extractYear')
})

test('anonymous operation uses fallback name', async () => {
  const {errors} = await flow([
    () => {
      throw new Error('fail')
    },
  ])({})

  expect(errors[0].operation).toBe('operation-0')
})

test('invalid return null treated as TypeError', async () => {
  const {errors} = await flow([
    () => null,
  ])({})

  expect(errors).toHaveLength(1)
  expect(errors[0].error).toBeInstanceOf(TypeError)
})

test('invalid return array treated as TypeError', async () => {
  const {errors} = await flow([
    () => [1, 2],
  ])({})

  expect(errors).toHaveLength(1)
  expect(errors[0].error).toBeInstanceOf(TypeError)
})

test('invalid return primitive treated as TypeError', async () => {
  const {errors} = await flow([
    () => 'invalid',
  ])({})

  expect(errors).toHaveLength(1)
  expect(errors[0].error).toBeInstanceOf(TypeError)
})

test('empty operations array returns initial state', async () => {
  const result = await flow([])({a: 1})

  expect(result).toEqual({
    value: {a: 1},
    errors: [],
    failure: false,
  })
})

test('repeated execution with different inputs', async () => {
  const process = flow([
    state => ({doubled: state.x * 2}),
  ])

  const r1 = await process({x: 5})
  const r2 = await process({x: 10})

  expect(r1.value).toEqual({x: 5, doubled: 10})
  expect(r2.value).toEqual({x: 10, doubled: 20})
})

test('no mutation of initial state', async () => {
  const original = {x: 1}

  await flow([
    state => ({y: state.x + 1}),
  ])(original)

  expect(original).toEqual({x: 1})
})

test('validation: non-array operations throws TypeError', () => {
  expect(() => flow('not an array')).toThrow(TypeError)
})

test('validation: non-function in operations throws TypeError', () => {
  expect(() => flow([() => ({}), 42])).toThrow(TypeError)
})

test('validation: null initialState throws TypeError', async () => {
  await expect(flow([() => ({})])(null)).rejects.toThrow(TypeError)
})

test('validation: array initialState throws TypeError', async () => {
  await expect(flow([() => ({})])([1, 2])).rejects.toThrow(TypeError)
})

test('validation: primitive initialState throws TypeError', async () => {
  await expect(flow([() => ({})])(42)).rejects.toThrow(TypeError)
})
