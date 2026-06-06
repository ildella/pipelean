import {test, expect} from 'vitest'
import {flow} from '$src/functional'

test('default collect: all operations execute', async () => {
  const result = await flow([
    () => ({a: 1}),
    state => ({b: state.a + 1}),
  ])({})

  expect(result).toEqual({
    value: {a: 1, b: 2},
    errors: [],
    failure: false,
  })
})

test('synchronous operations', async () => {
  const {value} = await flow([
    () => ({x: 10}),
    () => ({y: 20}),
  ])({})

  expect(value).toEqual({x: 10, y: 20})
})

test('asynchronous operations', async () => {
  const fetchX = async () => {
    const result = await Promise.resolve(10)
    return {x: result}
  }
  const fetchY = async () => {
    const result = await Promise.resolve(20)
    return {y: result}
  }

  const {value} = await flow([fetchX, fetchY])({})

  expect(value).toEqual({x: 10, y: 20})
})

test('sequential execution — order matters', async () => {
  const order = []

  const {value} = await flow([
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

test('shallow patch merging', async () => {
  const {value} = await flow([
    () => ({a: 1, nested: {x: 1}}),
    () => ({a: 2, nested: {y: 2}}),
  ])({})

  expect(value).toEqual({a: 2, nested: {y: 2}})
})

test('state preserved after failure', async () => {
  const {value} = await flow([
    () => ({a: 1}),
    () => {
      throw new Error('fail')
    },
  ])({})

  expect(value).toEqual({a: 1})
})

test('later operations run after failure under collect', async () => {
  const ran = []
  const {errors} = await flow([
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
  expect(errors).toHaveLength(1)
})
