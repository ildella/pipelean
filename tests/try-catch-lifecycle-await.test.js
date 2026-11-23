import {test, expect, vi} from 'vitest'
import {delay, tryCatch} from '$src/functional'

// All four lifecycle hooks are awaited. These tests use a real timer in the
// hooks so "the wrapper resolved first" is unambiguous, not a microtask race.

test('awaits onStart and onSuccess before onFinally', async () => {
  const order = []
  const wrapped = tryCatch(
    () => {
      order.push('fn')
      return 'value'
    },
    {
      onStart: async () => {
        await delay(5)
        order.push('start')
      },
      onSuccess: async () => {
        await delay(5)
        order.push('success')
      },
      onFinally: async () => {
        await delay(5)
        order.push('finally')
      },
    },
  )

  await expect(wrapped()).resolves.toBe('value')
  expect(order).toEqual(['start', 'fn', 'success', 'finally'])
})

test('an async onFinally has completed when the wrapper resolves', async () => {
  const order = []
  const wrapped = tryCatch(
    () => 'value',
    {
      onFinally: async () => {
        await delay(5)
        order.push('finally')
      },
    },
  )

  await wrapped()
  expect(order).toEqual(['finally'])
})

test('routes a rejecting async onStart to onError and drops', async () => {
  const startError = new Error('onStart failed')
  const order = []
  const fn = vi.fn(() => {
    order.push('fn')
    return 'value'
  })
  const onError = vi.fn(() => order.push('error'))
  const wrapped = tryCatch(fn, {
    onStart: async () => {
      await delay(5)
      order.push('start')
      throw startError
    },
    onError,
    onFinally: async () => {
      await delay(5)
      order.push('finally')
    },
  })

  await expect(wrapped()).resolves.toBeUndefined()
  expect(fn).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledWith(startError)
  expect(order).toEqual(['start', 'error', 'finally'])
})

test('onFinally rejection overrides the successful return', async () => {
  const finallyError = new Error('onFinally failed')
  const wrapped = tryCatch(
    () => 'value',
    {
      onFinally: async () => {
        await delay(5)
        throw finallyError
      },
    },
  )

  await expect(wrapped()).rejects.toBe(finallyError)
})

test('a rejecting async onFinally overrides the drop return', async () => {
  const finallyError = new Error('onFinally failed')
  const onError = vi.fn()
  const wrapped = tryCatch(
    () => Promise.reject(new Error('fn failed')),
    {
      onError,
      onFinally: async () => {
        await delay(5)
        throw finallyError
      },
    },
  )

  await expect(wrapped()).rejects.toBe(finallyError)
  expect(onError).toHaveBeenCalledOnce()
})

test('a rejecting async onFinally overrides the onError rethrow', async () => {
  const finallyError = new Error('onFinally failed')
  const onErrorError = new Error('onError failed')
  const wrapped = tryCatch(
    () => Promise.reject(new Error('fn failed')),
    {
      onError: async () => {
        await delay(1)
        throw onErrorError
      },
      onFinally: async () => {
        await delay(5)
        throw finallyError
      },
    },
  )

  await expect(wrapped()).rejects.toBe(finallyError)
})
