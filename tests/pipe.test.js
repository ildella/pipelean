import {test, expect} from 'vitest'
import {pipe} from '$src/functional'

test('composes functions left-to-right', async () => {
  // Must await because pipe is now async-safe
  const result = await pipe(x => x * 2, x => x + 1)(5)
  expect(result).toBe(11)
})
test('passes result through chain', async () => {
  const result = await pipe(
    x => x + 1,
    x => x * 3,
    x => x - 2,
  )(2)
  expect(result).toBe(7)
})

test('works with single function', async () => {
  await expect(pipe(x => x * 10)(4)).resolves.toBe(40)
})

test('propagates errors', async () => {
  const pipeline = pipe(
    () => { throw new Error('pipe broke') },
    x => x + 1,
  )
  // Promise rejection must be caught with rejects
  await expect(pipeline(1)).rejects.toThrow('pipe broke')
})

test('short-circuits on undefined', async () => {
  let called = false
  const result = await pipe(
    () => undefined,
    () => {
      called = true
      return 'should not reach'
    },
  )(1)
  expect(result).toBeUndefined()
  expect(called).toBe(false)
})

test('passes result through async chain', async () => {
  const result = await pipe(
    x => Promise.resolve(x + 1),
    x => Promise.resolve(x * 3),
  )(2)
  expect(result).toBe(9)
})
