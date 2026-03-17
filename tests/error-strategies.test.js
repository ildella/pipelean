import {test, expect} from 'vitest'
import {failFast, collect} from '..'

test('failFast is a frozen object with name "failFast"', () => {
  expect(failFast).toEqual({name: 'failFast'})
  expect(Object.isFrozen(failFast)).toBe(true)
})

test('collect is a frozen object with name "collect"', () => {
  expect(collect).toEqual({name: 'collect'})
  expect(Object.isFrozen(collect)).toBe(true)
})

test('strategies are distinct references', () => {
  expect(failFast).not.toBe(collect)
})
