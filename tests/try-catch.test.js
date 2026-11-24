import {test, expect, vi} from 'vitest'
import {
  collect, pipe, series, tryCatch,
} from '$src/functional'

test('returns fn result on success', async () => {
  const wrapped = tryCatch(() => Promise.resolve(42))
  await expect(wrapped()).resolves.toBe(42)
})

test('rethrows the original error by default (never swallows)', async () => {
  const error = new Error('boom')
  const wrapped = tryCatch(() => Promise.reject(error))
  await expect(wrapped()).rejects.toBe(error)
})

test('onError observes the error but the failure still rethrows', async () => {
  const error = new Error('something broke')
  const onError = vi.fn(() => 'ignored return')
  const wrapped = tryCatch(() => Promise.reject(error), {onError})

  await expect(wrapped()).rejects.toBe(error)
  expect(onError).toHaveBeenCalledWith(error)
})

test('a hook return value never substitutes for the result', async () => {
  const wrapped = tryCatch(() => Promise.resolve('real'), {
    onSuccess: () => 'not the result',
  })
  await expect(wrapped()).resolves.toBe('real')
})

test('recover turns the failure into a value and consumes it', async () => {
  const error = new Error('boom')
  const onError = vi.fn()
  const wrapped = tryCatch(() => Promise.reject(error), {
    onError,
    recover: e => `fallback:${e.message}`,
  })

  await expect(wrapped()).resolves.toBe('fallback:boom')
  expect(onError).toHaveBeenCalledWith(error)
})

test('recover receives the original error', async () => {
  const error = new Error('charge failed')
  const recover = vi.fn(() => null)
  await tryCatch(() => Promise.reject(error), {recover})()
  expect(recover).toHaveBeenCalledWith(error)
})

test('a throwing recover propagates its own error', async () => {
  const recoverError = new Error('recover failed')
  const wrapped = tryCatch(() => Promise.reject(new Error('op')), {
    recover: () => {
      throw recoverError
    },
  })
  await expect(wrapped()).rejects.toBe(recoverError)
})

test('onSuccess does not run on a recovered value', async () => {
  const onSuccess = vi.fn()
  const wrapped = tryCatch(() => Promise.reject(new Error('x')), {
    recover: () => 'recovered',
    onSuccess,
  })
  await expect(wrapped()).resolves.toBe('recovered')
  expect(onSuccess).not.toHaveBeenCalled()
})

test('a non-function recover is a build-time TypeError', () => {
  expect(() => tryCatch(() => 1, {recover: 'nope'}))
    .toThrow('tryCatch() recover must be a function')
})

test('passes args through to fn', async () => {
  const fn = vi.fn((a, b) => Promise.resolve(a + b))
  await expect(tryCatch(fn)(3, 7)).resolves.toBe(10)
  expect(fn).toHaveBeenCalledWith(3, 7)
})

test('works with no options', async () => {
  await expect(tryCatch(() => Promise.resolve('ok'))()).resolves.toBe('ok')
})

test('onStart is a boundary guard: a throw skips fn and rethrows', async () => {
  const startError = new Error('onStart failed')
  const fn = vi.fn()
  const onError = vi.fn()
  const wrapped = tryCatch(fn, {
    onStart: () => {
      throw startError
    },
    onError,
  })

  await expect(wrapped()).rejects.toBe(startError)
  expect(fn).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledWith(startError)
})

test('onStart failure can be recovered like a fn failure', async () => {
  const fn = vi.fn()
  const wrapped = tryCatch(fn, {
    onStart: () => {
      throw new Error('start')
    },
    recover: () => 'started-fallback',
  })
  await expect(wrapped()).resolves.toBe('started-fallback')
  expect(fn).not.toHaveBeenCalled()
})

test('series: recover() => undefined drops the item', async () => {
  const safe = tryCatch(n => {
    if (n === 2)
      throw new Error('boom')
    return n
  }, {recover: () => undefined})

  const {results, errors} = await series([1, 2, 3], safe)
  expect(results).toEqual([1, 3])
  expect(errors).toEqual([])
})

test('without recover, series strategy still decides policy', async () => {
  const observed = tryCatch(n => {
    if (n === 2)
      throw new Error('boom')
    return n
  })

  const {results, errors} = await series([1, 2, 3], observed, {
    strategy: collect,
  })
  expect(results).toEqual([1, 3])
  expect(errors).toHaveLength(1)
})

test('composes with pipe: recover() => undefined short-circuits', async () => {
  let ran = false
  const safe = tryCatch(() => {
    throw new Error('boom')
  }, {recover: () => undefined})

  const result = await pipe(safe, () => {
    ran = true
    return 'next'
  })(1)

  expect(result).toBeUndefined()
  expect(ran).toBe(false)
})

test('without recover, a failure escapes pipe to the caller', async () => {
  const error = new Error('boom')
  const safe = tryCatch(() => {
    throw error
  })
  await expect(pipe(safe, () => 'next')(1)).rejects.toBe(error)
})
