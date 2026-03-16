import {test, expect} from 'vitest'
import {failFast, skip, collect} from '$lib/functional'

test('failFast is a frozen object with name "failFast"', () => {
  expect(failFast).toEqual({name: 'failFast'})
  expect(Object.isFrozen(failFast)).toBe(true)
})

test('skip is a frozen object with name "skip"', () => {
  expect(skip).toEqual({name: 'skip'})
  expect(Object.isFrozen(skip)).toBe(true)
})

test('collect is a frozen object with name "collect"', () => {
  expect(collect).toEqual({name: 'collect'})
  expect(Object.isFrozen(collect)).toBe(true)
})

test('strategies are distinct references', () => {
  expect(failFast).not.toBe(skip)
  expect(failFast).not.toBe(collect)
  expect(skip).not.toBe(collect)
})
