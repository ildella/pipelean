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
  expect(onError).toHaveBeenCalledWith({args: [], name: undefined, error})
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
    recover: ({error: recovered}) => `fallback:${recovered.message}`,
  })

  await expect(wrapped()).resolves.toBe('fallback:boom')
  expect(onError).toHaveBeenCalledWith({args: [], name: undefined, error})
})

test('recover receives the original error', async () => {
  const error = new Error('charge failed')
  const recover = vi.fn(() => null)
  await tryCatch(() => Promise.reject(error), {recover})()
  expect(recover).toHaveBeenCalledWith({
    args: [], name: undefined, error,
  })
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

test('hooks receive {args, name} plus their value', async () => {
  const onStart = vi.fn()
  const onSuccess = vi.fn()
  const onFinally = vi.fn()
  const wrapped = tryCatch((a, b) => Promise.resolve(a + b), {
    name: 'add', onStart, onSuccess, onFinally,
  })

  await expect(wrapped(3, 7)).resolves.toBe(10)
  expect(onStart).toHaveBeenCalledWith({args: [3, 7], name: 'add'})
  expect(onSuccess).toHaveBeenCalledWith({
    args: [3, 7], name: 'add', result: 10,
  })
  expect(onFinally).toHaveBeenCalledWith({args: [3, 7], name: 'add'})
})

test('onError and recover receive {args, name, error}', async () => {
  const error = new Error('boom')
  const onError = vi.fn()
  const recover = vi.fn(() => 'fallback')
  const wrapped = tryCatch(() => Promise.reject(error), {
    name: 'op', onError, recover,
  })

  await expect(wrapped('a', 1)).resolves.toBe('fallback')
  expect(onError).toHaveBeenCalledWith({
    args: ['a', 1], name: 'op', error,
  })
  expect(recover).toHaveBeenCalledWith({
    args: ['a', 1], name: 'op', error,
  })
})

test('onStart cannot change fn args by mutating context.args', async () => {
  const fn = vi.fn((a, b) => Promise.resolve([a, b]))
  const wrapped = tryCatch(fn, {
    onStart: ({args}) => {
      args.push('extra')
    },
  })

  await expect(wrapped(1, 2)).resolves.toEqual([1, 2])
  expect(fn).toHaveBeenCalledWith(1, 2)
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
  expect(onError).toHaveBeenCalledWith({
    args: [], name: undefined, error: startError,
  })
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

test('a hook that throws after a recover propagates itself', async () => {
  const hookError = new Error('onError failed')
  const wrapped = tryCatch(() => Promise.reject(new Error('op')), {
    onError: () => {
      throw hookError
    },
    recover: () => 'recovered',
  })

  await expect(wrapped()).rejects.toBe(hookError)
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
