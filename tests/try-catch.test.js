import {test, expect, vi} from 'vitest'
import {tryCatch} from '$src/functional'

test('returns fn result on success', async () => {
  const wrapped = tryCatch(() => Promise.resolve(42))
  await expect(wrapped()).resolves.toBe(42)
})

test('returns null on error when no onError provided', async () => {
  const wrapped = tryCatch(() => Promise.reject(new Error('boom')))
  await expect(wrapped()).resolves.toBeNull()
})

test('returns onError result on error', async () => {
  const wrapped = tryCatch(
    () => Promise.reject(new Error('boom')),
  )
  await expect(wrapped()).resolves.toBeNull()
})

test('passes error to onError', async () => {
  const error = new Error('something broke')
  const onError = vi.fn(() => 'recovered')
  await tryCatch(() => Promise.reject(error), {onError})()
  expect(onError).toHaveBeenCalledWith(error)
})

test('calls onStart before fn and onFinally after', async () => {
  const order = []
  await tryCatch(
    () => {
      order.push('fn')
      return Promise.resolve()
    },
    {
      onStart: () => order.push('start'),
      onFinally: () => order.push('finally'),
    },
  )()
  expect(order).toEqual(['start', 'fn', 'finally'])
})

test('calls onFinally even on error', async () => {
  const onFinally = vi.fn()
  await tryCatch(() => Promise.reject(new Error('fail')), {onFinally})()
  expect(onFinally).toHaveBeenCalledOnce()
})

test('awaits async onSuccess before onFinally', async () => {
  const order = []
  await tryCatch(
    () => Promise.resolve('data'),
    {
      onSuccess: () => {
        order.push('success')
        return Promise.resolve()
      },
      onFinally: () => order.push('finally'),
    },
  )()
  expect(order).toEqual(['success', 'finally'])
})

test('passes args through to fn', async () => {
  const fn = vi.fn((a, b) => Promise.resolve(a + b))
  await expect(tryCatch(fn)(3, 7)).resolves.toBe(10)
  expect(fn).toHaveBeenCalledWith(3, 7)
})

test('works with no options', async () => {
  await expect(tryCatch(() => Promise.resolve('ok'))()).resolves.toBe('ok')
})
