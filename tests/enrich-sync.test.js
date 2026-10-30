import {test, expect} from 'vitest'
import {enrichSync} from '$src/index'

test('default collect: all operations execute, final state correct', () => {
  const result = enrichSync([
    () => ({a: 1}),
    state => ({b: state.a + 1}),
  ])({})

  expect(result).toEqual({
    value: {a: 1, b: 2},
    errors: [],
    failure: false,
  })
})

test('synchronous operations', () => {
  const {value} = enrichSync([
    () => ({x: 10}),
    () => ({y: 20}),
  ])({})

  expect(value).toEqual({x: 10, y: 20})
})

test('sequential execution — order matters', () => {
  const order = []

  const {value} = enrichSync([
    () => {
      order.push(1)
      return {a: 1}
    },
    () => {
      order.push(2)
      return {b: 2}
    },
    () => {
      order.push(3)
      return {c: 3}
    },
  ])({})

  expect(order).toEqual([1, 2, 3])
  expect(value).toEqual({a: 1, b: 2, c: 3})
})

test('shallow patch merging', () => {
  const {value} = enrichSync([
    () => ({a: 1, nested: {x: 1}}),
    () => ({a: 2, nested: {y: 2}}),
  ])({})

  expect(value).toEqual({a: 2, nested: {y: 2}})
})

test('state preserved after failure', () => {
  const {value} = enrichSync([
    () => ({a: 1}),
    () => {
      throw new Error('fail')
    },
  ])({})

  expect(value).toEqual({a: 1})
})

test('later operations run after failure under collect', () => {
  const ran = []

  enrichSync([
    () => {
      ran.push(1)
      return {a: 1}
    },
    () => {
      ran.push(2)
      throw new Error('fail')
    },
    state => {
      ran.push(3)
      return {b: state.a + 1}
    },
  ])({})

  expect(ran).toEqual([1, 2, 3])
})
