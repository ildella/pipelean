import {test, expect} from 'vitest'
import {pipeSync} from '$src/index'

test('composes functions left-to-right', () => {
  const result = pipeSync(x => x * 2, x => x + 1)(5)
  expect(result).toBe(11)
})

test('passes result through chain', () => {
  const result = pipeSync(
    x => x + 1,
    x => x * 3,
    x => x - 2,
  )(2)
  expect(result).toBe(7)
})

test('works with single function', () => {
  expect(pipeSync(x => x * 10)(4)).toBe(40)
})

test('propagates errors', () => {
  const pipeline = pipeSync(
    () => { throw new Error('pipe broke') },
    x => x + 1,
  )
  expect(() => pipeline(1)).toThrow('pipe broke')
})

test('short-circuits on undefined', () => {
  let called = false
  const result = pipeSync(
    () => undefined,
    () => {
      called = true
      return 'should not reach'
    },
  )(1)
  expect(result).toBeUndefined()
  expect(called).toBe(false)
})

test('returns value synchronously not a promise', () => {
  const result = pipeSync(x => x * 2)(5)
  expect(result).not.toBeInstanceOf(Promise)
})
