import {test, expect} from 'vitest'
import {flowSync} from '$src/index'

test('normalized errors shape', () => {
  const {errors} = flowSync([
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

test('named operation uses function.name', () => {
  const {errors} = flowSync([
    function extractYear () {
      throw new Error('fail')
    },
  ])({})

  expect(errors[0].operation).toBe('extractYear')
})

test('anonymous operation uses fallback name', () => {
  const {errors} = flowSync([
    () => {
      throw new Error('fail')
    },
  ])({})

  expect(errors[0].operation).toBe('operation-0')
})

test('invalid return null treated as TypeError', () => {
  const {errors} = flowSync([
    () => null,
  ])({})

  expect(errors).toHaveLength(1)
  expect(errors[0].error).toBeInstanceOf(TypeError)
})

test('invalid return array treated as TypeError', () => {
  const {errors} = flowSync([
    () => [1, 2],
  ])({})

  expect(errors).toHaveLength(1)
  expect(errors[0].error).toBeInstanceOf(TypeError)
})

test('invalid return primitive treated as TypeError', () => {
  const {errors} = flowSync([
    () => 'invalid',
  ])({})

  expect(errors).toHaveLength(1)
  expect(errors[0].error).toBeInstanceOf(TypeError)
})

test('empty operations array returns initial state', () => {
  const result = flowSync([])({a: 1})

  expect(result).toEqual({
    value: {a: 1},
    errors: [],
    failure: false,
  })
})

test('repeated execution with different inputs', () => {
  const process = flowSync([
    state => ({doubled: state.x * 2}),
  ])

  const r1 = process({x: 5})
  const r2 = process({x: 10})

  expect(r1.value).toEqual({x: 5, doubled: 10})
  expect(r2.value).toEqual({x: 10, doubled: 20})
})

test('no mutation of initial state', () => {
  const original = {x: 1}

  flowSync([
    state => ({y: state.x + 1}),
  ])(original)

  expect(original).toEqual({x: 1})
})

test('validation: non-array operations throws TypeError', () => {
  expect(() => flowSync('not an array')).toThrow(TypeError)
})

test('validation: non-function in operations throws TypeError', () => {
  expect(() => flowSync([() => ({}), 42])).toThrow(TypeError)
})

test('validation: null initialState throws TypeError', () => {
  expect(() => flowSync([() => ({})])(null)).toThrow(TypeError)
})

test('validation: array initialState throws TypeError', () => {
  expect(() => flowSync([() => ({})])([1, 2])).toThrow(TypeError)
})

test('validation: primitive initialState throws TypeError', () => {
  expect(() => flowSync([() => ({})])(42)).toThrow(TypeError)
})
