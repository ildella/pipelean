import {test, expect} from 'vitest'
import {pipeAsync} from '$src/functional'

test('composes functions left-to-right', async () => {
  const result = await pipeAsync(x => x * 2, x => x + 1)(5)
  expect(result).toBe(11)
})

test('passes result through async chain', async () => {
  const result = await pipeAsync(
    x => Promise.resolve(x + 1),
    x => Promise.resolve(x * 3),
  )(2)
  expect(result).toBe(9)
})

test('works with single function', async () => {
  await expect(pipeAsync(x => x * 10)(4)).resolves.toBe(40)
})

test('propagates errors', async () => {
  const pipeline = pipeAsync(
    () => { throw new Error('pipe broke') },
    x => x + 1,
  )
  await expect(pipeline(1)).rejects.toThrow('pipe broke')
})
