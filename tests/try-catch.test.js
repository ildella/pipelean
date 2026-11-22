import {test, expect, vi} from 'vitest'
import {pipe, series, tryCatch} from '$src/functional'

test('returns fn result on success', async () => {
  const wrapped = tryCatch(() => Promise.resolve(42))
  await expect(wrapped()).resolves.toBe(42)
})

test('returns undefined on error (the drop signal)', async () => {
  const wrapped = tryCatch(() => Promise.reject(new Error('boom')))
  await expect(wrapped()).resolves.toBeUndefined()
})

test('returns undefined on error even when onError is provided', async () => {
  const wrapped = tryCatch(
    () => Promise.reject(new Error('boom')),
    {onError: () => 'recovered'},
  )
  await expect(wrapped()).resolves.toBeUndefined()
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

test('propagates an error thrown by onError, not the fn error', async () => {
  const fnError = new Error('fn failed')
  const onErrorError = new Error('onError failed')
  const onFinally = vi.fn()
  const wrapped = tryCatch(
    () => Promise.reject(fnError),
    {
      onError: () => {
        throw onErrorError
      },
      onFinally,
    },
  )

  await expect(wrapped()).rejects.toBe(onErrorError)
  expect(onFinally).toHaveBeenCalledOnce()
})

test('propagates a rejection returned by onError', async () => {
  const onErrorError = new Error('async onError failed')
  const onFinally = vi.fn()
  const wrapped = tryCatch(
    () => Promise.reject(new Error('fn failed')),
    {
      onError: () => Promise.reject(onErrorError),
      onFinally,
    },
  )

  await expect(wrapped()).rejects.toBe(onErrorError)
  expect(onFinally).toHaveBeenCalledOnce()
})

test('onError can augment the original error and rethrow it', async () => {
  const original = new Error('charge failed')
  const onFinally = vi.fn()
  const wrapped = tryCatch(
    () => Promise.reject(original),
    {
      onError: error => {
        throw Object.assign(error, {operation: 'charge'})
      },
      onFinally,
    },
  )

  const thrown = await wrapped().catch(error => error)
  expect(thrown).toBe(original)
  expect(thrown.operation).toBe('charge')
  expect(onFinally).toHaveBeenCalledOnce()
})

test('routes a throwing onSuccess to onError and drops it', async () => {
  const successError = new Error('onSuccess failed')
  const onError = vi.fn()
  const onFinally = vi.fn()
  const wrapped = tryCatch(
    () => Promise.resolve('data'),
    {
      onSuccess: () => {
        throw successError
      },
      onError,
      onFinally,
    },
  )

  await expect(wrapped()).resolves.toBeUndefined()
  expect(onError).toHaveBeenCalledWith(successError)
  expect(onFinally).toHaveBeenCalledOnce()
})

test('does not call onSuccess when fn throws', async () => {
  const onSuccess = vi.fn()
  const wrapped = tryCatch(
    () => Promise.reject(new Error('boom')),
    {onSuccess},
  )

  await wrapped()
  expect(onSuccess).not.toHaveBeenCalled()
})

test('composes with series: failed items are dropped', async () => {
  const safe = tryCatch(n => {
    if (n === 2)
      throw new Error('boom')
    return n
  })

  const {results, errors} = await series([1, 2, 3], safe)
  expect(results).toEqual([1, 3])
  expect(errors).toEqual([])
})

test('composes with pipe: failure short-circuits', async () => {
  let ran = false
  const safe = tryCatch(() => {
    throw new Error('boom')
  })

  const result = await pipe(safe, () => {
    ran = true
    return 'next'
  })(1)

  expect(result).toBeUndefined()
  expect(ran).toBe(false)
})
