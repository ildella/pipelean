import {test, expect, vi} from 'vitest'
import {delay, tryCatch} from '$src/functional'

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

test('async onStart rejection rethrown; fn never runs', async () => {
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

  await expect(wrapped()).rejects.toBe(startError)
  expect(fn).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledWith({
    args: [], name: undefined, error: startError,
  })
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

test('async onFinally rejection does not mask the op error', async () => {
  const opError = new Error('fn failed')
  const finallyError = new Error('onFinally failed')
  const onError = vi.fn()
  const wrapped = tryCatch(
    () => Promise.reject(opError),
    {
      onError,
      onFinally: async () => {
        await delay(5)
        throw finallyError
      },
    },
  )

  const thrown = await wrapped().catch(error => error)
  expect(thrown).toBe(opError)
  expect(thrown.hookErrors).toEqual([finallyError])
  expect(onError).toHaveBeenCalledOnce()
})

test('onError + onFinally rejections both secondary to op error', async () => {
  const opError = new Error('fn failed')
  const onErrorError = new Error('onError failed')
  const finallyError = new Error('onFinally failed')
  const wrapped = tryCatch(
    () => Promise.reject(opError),
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

  const thrown = await wrapped().catch(error => error)
  expect(thrown).toBe(opError)
  expect(thrown.hookErrors).toEqual([onErrorError, finallyError])
})
