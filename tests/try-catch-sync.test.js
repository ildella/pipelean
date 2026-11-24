import {test, expect, vi} from 'vitest'
import {
  collect, pipeSync, seriesSync, tryCatchSync,
} from '$src/index'

test('returns fn result on success', () => {
  expect(tryCatchSync(() => 42)()).toBe(42)
})

test('rethrows the original error by default (never swallows)', () => {
  const error = new Error('boom')
  const wrapped = tryCatchSync(() => {
    throw error
  })
  expect(() => wrapped()).toThrow(error)
})

test('onError observes the error but the failure still rethrows', () => {
  const error = new Error('something broke')
  const onError = vi.fn(() => 'ignored return')
  const wrapped = tryCatchSync(() => {
    throw error
  }, {onError})

  expect(() => wrapped()).toThrow(error)
  expect(onError).toHaveBeenCalledWith(error)
})

test('recover turns the failure into a value and consumes it', () => {
  const error = new Error('boom')
  const onError = vi.fn()
  const wrapped = tryCatchSync(() => {
    throw error
  }, {onError, recover: e => `fallback:${e.message}`})

  expect(wrapped()).toBe('fallback:boom')
  expect(onError).toHaveBeenCalledWith(error)
})

test('a throwing recover propagates its own error', () => {
  const recoverError = new Error('recover failed')
  const wrapped = tryCatchSync(() => {
    throw new Error('op')
  }, {
    recover: () => {
      throw recoverError
    },
  })
  expect(() => wrapped()).toThrow(recoverError)
})

test('onSuccess does not run on a recovered value', () => {
  const onSuccess = vi.fn()
  const wrapped = tryCatchSync(() => {
    throw new Error('x')
  }, {recover: () => 'recovered', onSuccess})
  expect(wrapped()).toBe('recovered')
  expect(onSuccess).not.toHaveBeenCalled()
})

test('a non-function recover is a build-time TypeError', () => {
  expect(() => tryCatchSync(() => 1, {recover: 42}))
    .toThrow('tryCatchSync() recover must be a function')
})

test('an async recover is a fatal TypeError pointing at tryCatch', () => {
  const wrapped = tryCatchSync(() => {
    throw new Error('op')
  }, {recover: async () => await 1})
  expect(() => wrapped())
    .toThrow('tryCatchSync() recover returned a Promise; use tryCatch()')
})

test('passes args through to fn', () => {
  const fn = vi.fn((a, b) => a + b)
  expect(tryCatchSync(fn)(3, 7)).toBe(10)
  expect(fn).toHaveBeenCalledWith(3, 7)
})

test('returns value synchronously, not a promise', () => {
  expect(tryCatchSync(() => 42)()).not.toBeInstanceOf(Promise)
})

test('onStart is a boundary guard: a throw skips fn and rethrows', () => {
  const startError = new Error('onStart failed')
  const fn = vi.fn()
  const onError = vi.fn()
  const wrapped = tryCatchSync(fn, {
    onStart: () => {
      throw startError
    },
    onError,
  })

  expect(() => wrapped()).toThrow(startError)
  expect(fn).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledWith(startError)
})

test('composes with seriesSync: recover() => undefined drops the item', () => {
  const safe = tryCatchSync(n => {
    if (n === 2)
      throw new Error('boom')
    return n
  }, {recover: () => undefined})

  const {results, errors} = seriesSync([1, 2, 3], safe)
  expect(results).toEqual([1, 3])
  expect(errors).toEqual([])
})

test('without recover, seriesSync strategy still decides policy', () => {
  const observed = tryCatchSync(n => {
    if (n === 2)
      throw new Error('boom')
    return n
  })
  const {results, errors} = seriesSync([1, 2, 3], observed, {strategy: collect})
  expect(results).toEqual([1, 3])
  expect(errors).toHaveLength(1)
})

test('composes with pipeSync: recover() => undefined short-circuits', () => {
  let ran = false
  const safe = tryCatchSync(() => {
    throw new Error('boom')
  }, {recover: () => undefined})

  const result = pipeSync(safe, () => {
    ran = true
    return 'next'
  })(1)

  expect(result).toBeUndefined()
  expect(ran).toBe(false)
})

test('without recover, a failure escapes pipeSync to the caller', () => {
  const error = new Error('boom')
  const safe = tryCatchSync(() => {
    throw error
  })
  expect(() => pipeSync(safe, () => 'next')(1)).toThrow(error)
})
