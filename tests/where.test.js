import {test, expect} from 'vitest'
import {where, filter} from '$src/functional'

test('single property match returns true', () => {
  const pred = where({type: 'filesystem'})
  expect(pred({type: 'filesystem', name: 'foo'})).toBe(true)
})

test('single property mismatch returns false', () => {
  const pred = where({type: 'filesystem'})
  expect(pred({type: 'network', name: 'foo'})).toBe(false)
})

test('multiple properties all must match', () => {
  const pred = where({type: 'fs', active: true})
  expect(pred({type: 'fs', active: true, name: 'x'})).toBe(true)
  expect(pred({type: 'fs', active: false})).toBe(false)
  expect(pred({type: 'net', active: true})).toBe(false)
})

test('empty pattern matches everything', () => {
  const pred = where({})
  expect(pred({anything: 'at all'})).toBe(true)
  expect(pred({})).toBe(true)
})

test('missing key in item returns false', () => {
  const pred = where({type: 'fs'})
  expect(pred({name: 'foo'})).toBe(false)
})

test('strict equality — no coercion', () => {
  const pred = where({count: 1})
  expect(pred({count: 1})).toBe(true)
  expect(pred({count: '1'})).toBe(false)
})

test('works as filter predicate', async () => {
  const libs = [
    {type: 'filesystem', name: 'a'},
    {type: 'network', name: 'b'},
    {type: 'filesystem', name: 'c'},
  ]
  const result = await filter(libs, where({type: 'filesystem'}))
  expect(result.results).toEqual([
    {type: 'filesystem', name: 'a'},
    {type: 'filesystem', name: 'c'},
  ])
})

test('works with curried filter', async () => {
  const libs = [
    {type: 'filesystem', name: 'a'},
    {type: 'network', name: 'b'},
  ]
  const keepFs = filter(where({type: 'filesystem'}))
  const result = await keepFs(libs)
  expect(result.results).toEqual([{type: 'filesystem', name: 'a'}])
})
