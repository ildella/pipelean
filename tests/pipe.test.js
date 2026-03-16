import {test, expect} from 'vitest'
import {pipe} from '$lib/functional'

test('composes functions left-to-right', () => {
  const result = pipe(x => x * 2, x => x + 1)(5)
  expect(result).toBe(11)
})

test('passes result through chain', () => {
  const result = pipe(
    x => x + 1,
    x => x * 3,
    x => x - 2,
  )(2)
  expect(result).toBe(7)
})

test('works with single function', () => {
  expect(pipe(x => x * 10)(4)).toBe(40)
})

test('propagates errors', () => {
  const pipeline = pipe(
    () => { throw new Error('pipe broke') },
    x => x + 1,
  )
  expect(() => pipeline(1)).toThrow('pipe broke')
})
