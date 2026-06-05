import {test, expect, vi} from 'vitest'
import {tryCatchSync} from '$src/index'

test('returns fn result on success', () => {
  const wrapped = tryCatchSync(() => 42)
  expect(wrapped()).toBe(42)
})

test('returns null on error when no onError provided', () => {
  const wrapped = tryCatchSync(() => {
    throw new Error('boom')
  })
  expect(wrapped()).toBeNull()
})

test('passes error to onError', () => {
  const error = new Error('something broke')
  const onError = vi.fn()
  const wrapped = tryCatchSync(() => {
    throw error
  }, {onError})
  wrapped()
  expect(onError).toHaveBeenCalledWith(error)
})

test('calls onStart before fn and onFinally after', () => {
  const order = []
  tryCatchSync(
    () => {
      order.push('fn')
    },
    {
      onStart: () => order.push('start'),
      onFinally: () => order.push('finally'),
    },
  )()
  expect(order).toEqual(['start', 'fn', 'finally'])
})

test('calls onFinally even on error', () => {
  const onFinally = vi.fn()
  const wrapped = tryCatchSync(() => {
    throw new Error('fail')
  }, {onFinally})
  wrapped()
  expect(onFinally).toHaveBeenCalledOnce()
})

test('passes args through to fn', () => {
  const fn = vi.fn((a, b) => a + b)
  expect(tryCatchSync(fn)(3, 7)).toBe(10)
  expect(fn).toHaveBeenCalledWith(3, 7)
})

test('works with no options', () => {
  expect(tryCatchSync(() => 'ok')()).toBe('ok')
})

test('returns value synchronously not a promise', () => {
  const wrapped = tryCatchSync(() => 42)
  const result = wrapped()
  expect(result).not.toBeInstanceOf(Promise)
})
