import {test, expect, vi} from 'vitest'
import {tryCatch} from '$src/functional'

test('onSuccess throw propagates, not relabeled as op failure', async () => {
  const hookError = new Error('onSuccess failed')
  const onError = vi.fn()
  const onFinally = vi.fn()
  const wrapped = tryCatch(() => Promise.resolve('data'), {
    onSuccess: () => {
      throw hookError
    },
    onError,
    onFinally,
  })

  await expect(wrapped()).rejects.toBe(hookError)
  expect(onError).not.toHaveBeenCalled()
  expect(onFinally).toHaveBeenCalledOnce()
})

test('a throwing onFinally on the success path propagates', async () => {
  const finallyError = new Error('onFinally failed')
  const wrapped = tryCatch(() => Promise.resolve('data'), {
    onFinally: () => {
      throw finallyError
    },
  })
  await expect(wrapped()).rejects.toBe(finallyError)
})

test('a throwing onError never replaces the operation error', async () => {
  const opError = new Error('operation failed')
  const hookError = new Error('onError failed')
  const onFinally = vi.fn()
  const wrapped = tryCatch(() => Promise.reject(opError), {
    onError: () => {
      throw hookError
    },
    onFinally,
  })

  const thrown = await wrapped().catch(error => error)
  expect(thrown).toBe(opError)
  expect(thrown.hookErrors).toEqual([hookError])
  expect(onFinally).toHaveBeenCalledOnce()
})

test('a throwing onFinally never masks the operation error', async () => {
  const opError = new Error('operation failed')
  const finallyError = new Error('onFinally failed')
  const wrapped = tryCatch(() => Promise.reject(opError), {
    onFinally: () => {
      throw finallyError
    },
  })

  const thrown = await wrapped().catch(error => error)
  expect(thrown).toBe(opError)
  expect(thrown.hookErrors).toEqual([finallyError])
})

test('multiple secondary hook errors are all preserved', async () => {
  const opError = new Error('operation failed')
  const onErrorError = new Error('onError failed')
  const finallyError = new Error('onFinally failed')
  const wrapped = tryCatch(() => Promise.reject(opError), {
    onError: () => {
      throw onErrorError
    },
    onFinally: () => {
      throw finallyError
    },
  })

  const thrown = await wrapped().catch(error => error)
  expect(thrown).toBe(opError)
  expect(thrown.hookErrors).toEqual([onErrorError, finallyError])
})

test('success path: first hook failure primary, later secondary', async () => {
  const successError = new Error('onSuccess failed')
  const finallyError = new Error('onFinally failed')
  const wrapped = tryCatch(() => Promise.resolve('data'), {
    onSuccess: () => {
      throw successError
    },
    onFinally: () => {
      throw finallyError
    },
  })

  const thrown = await wrapped().catch(error => error)
  expect(thrown).toBe(successError)
  expect(thrown.hookErrors).toEqual([finallyError])
})

test('frozen primary unchanged; its hook error is dropped', async () => {
  const frozen = Object.freeze(new Error('frozen'))
  const wrapped = tryCatch(() => Promise.reject(frozen), {
    onError: () => {
      throw new Error('onError failed')
    },
  })

  const thrown = await wrapped().catch(error => error)
  expect(thrown).toBe(frozen)
  expect(thrown.hookErrors).toBeUndefined()
})

test('primitive primary unchanged; its hook error is dropped', async () => {
  // eslint-disable-next-line prefer-promise-reject-errors
  const wrapped = tryCatch(() => Promise.reject('primitive failure'), {
    onFinally: () => {
      throw new Error('onFinally failed')
    },
  })

  const thrown = await wrapped().catch(error => error)
  expect(thrown).toBe('primitive failure')
})

test('post-recover: first hook failure stays primary', async () => {
  const onErrorError = new Error('onError failed')
  const finallyError = new Error('onFinally failed')
  const wrapped = tryCatch(() => Promise.reject(new Error('op')), {
    onError: () => {
      throw onErrorError
    },
    recover: () => 'recovered',
    onFinally: () => {
      throw finallyError
    },
  })

  const thrown = await wrapped().catch(error => error)
  expect(thrown).toBe(onErrorError)
  expect(thrown.hookErrors).toEqual([finallyError])
})

test('post-recover: later hook failure propagates alone', async () => {
  const finallyError = new Error('onFinally failed')
  const wrapped = tryCatch(() => Promise.reject(new Error('op')), {
    recover: () => 'recovered',
    onFinally: () => {
      throw finallyError
    },
  })

  const thrown = await wrapped().catch(error => error)
  expect(thrown).toBe(finallyError)
  expect(thrown.hookErrors).toBeUndefined()
})

test('post-recover: frozen first hook error unchanged', async () => {
  const frozen = Object.freeze(new Error('onError failed'))
  const wrapped = tryCatch(() => Promise.reject(new Error('op')), {
    onError: () => {
      throw frozen
    },
    recover: () => 'recovered',
    onFinally: () => {
      throw new Error('onFinally failed')
    },
  })

  const thrown = await wrapped().catch(error => error)
  expect(thrown).toBe(frozen)
  expect(thrown.hookErrors).toBeUndefined()
})

test('a throwing recover keeps the earlier hook error secondary', async () => {
  const onErrorError = new Error('onError failed')
  const recoverError = new Error('recover failed')
  const wrapped = tryCatch(() => Promise.reject(new Error('op')), {
    onError: () => {
      throw onErrorError
    },
    recover: () => {
      throw recoverError
    },
  })

  const thrown = await wrapped().catch(error => error)
  expect(thrown).toBe(recoverError)
  expect(thrown.hookErrors).toEqual([onErrorError])
})
