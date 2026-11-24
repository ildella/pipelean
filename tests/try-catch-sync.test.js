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
  expect(onError).toHaveBeenCalledWith({args: [], name: undefined, error})
})

test('recover turns the failure into a value and consumes it', () => {
  const error = new Error('boom')
  const onError = vi.fn()
  const wrapped = tryCatchSync(() => {
    throw error
  }, {
    onError,
    recover: ({error}) => `fallback:${error.message}`,
  })

  expect(wrapped()).toBe('fallback:boom')
  expect(onError).toHaveBeenCalledWith({args: [], name: undefined, error})
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

test('hooks receive {args, name} plus their value', () => {
  const onStart = vi.fn()
  const onSuccess = vi.fn()
  const onFinally = vi.fn()
  const wrapped = tryCatchSync((a, b) => a + b, {
    name: 'add', onStart, onSuccess, onFinally,
  })

  expect(wrapped(3, 7)).toBe(10)
  expect(onStart).toHaveBeenCalledWith({args: [3, 7], name: 'add'})
  expect(onSuccess).toHaveBeenCalledWith({
    args: [3, 7], name: 'add', result: 10,
  })
  expect(onFinally).toHaveBeenCalledWith({args: [3, 7], name: 'add'})
})

test('onError and recover receive {args, name, error}', () => {
  const error = new Error('boom')
  const onError = vi.fn()
  const recover = vi.fn(() => 'fallback')
  const wrapped = tryCatchSync(() => {
    throw error
  }, {name: 'op', onError, recover})

  expect(wrapped('a', 1)).toBe('fallback')
  expect(onError).toHaveBeenCalledWith({
    args: ['a', 1], name: 'op', error,
  })
  expect(recover).toHaveBeenCalledWith({
    args: ['a', 1], name: 'op', error,
  })
})

test('onStart cannot change fn args by mutating context.args', () => {
  const fn = vi.fn((a, b) => [a, b])
  const wrapped = tryCatchSync(fn, {
    onStart: ({args}) => {
      args.push('extra')
    },
  })

  expect(wrapped(1, 2)).toEqual([1, 2])
  expect(fn).toHaveBeenCalledWith(1, 2)
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
  expect(onError).toHaveBeenCalledWith({
    args: [], name: undefined, error: startError,
  })
})

test('a hook that throws after a successful recover propagates itself', () => {
  const hookError = new Error('onError failed')
  const wrapped = tryCatchSync(() => {
    throw new Error('op')
  }, {
    onError: () => {
      throw hookError
    },
    recover: () => 'recovered',
  })

  expect(() => wrapped()).toThrow(hookError)
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
  const {results, errors} = seriesSync([1, 2, 3], observed, {
    strategy: collect,
  })
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
