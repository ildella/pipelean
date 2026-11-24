import {test, expect, vi} from 'vitest'
import {tryCatchSync} from '$src/index'

test('onSuccess throw propagates, not relabeled as op failure', () => {
  const hookError = new Error('onSuccess failed')
  const onError = vi.fn()
  const onFinally = vi.fn()
  const wrapped = tryCatchSync(() => 'data', {
    onSuccess: () => {
      throw hookError
    },
    onError,
    onFinally,
  })

  expect(() => wrapped()).toThrow(hookError)
  expect(onError).not.toHaveBeenCalled()
  expect(onFinally).toHaveBeenCalledOnce()
})

test('a throwing onError never replaces the operation error', () => {
  const opError = new Error('operation failed')
  const hookError = new Error('onError failed')
  const wrapped = tryCatchSync(() => {
    throw opError
  }, {
    onError: () => {
      throw hookError
    },
  })

  let thrown
  try {
    wrapped()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBe(opError)
  expect(thrown.hookErrors).toEqual([hookError])
})

test('a throwing onFinally never masks the operation error', () => {
  const opError = new Error('operation failed')
  const finallyError = new Error('onFinally failed')
  const wrapped = tryCatchSync(() => {
    throw opError
  }, {
    onFinally: () => {
      throw finallyError
    },
  })

  let thrown
  try {
    wrapped()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBe(opError)
  expect(thrown.hookErrors).toEqual([finallyError])
})

test('multiple secondary hook errors are all preserved', () => {
  const opError = new Error('operation failed')
  const onErrorError = new Error('onError failed')
  const finallyError = new Error('onFinally failed')
  const wrapped = tryCatchSync(() => {
    throw opError
  }, {
    onError: () => {
      throw onErrorError
    },
    onFinally: () => {
      throw finallyError
    },
  })

  let thrown
  try {
    wrapped()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBe(opError)
  expect(thrown.hookErrors).toEqual([onErrorError, finallyError])
})

test('a frozen primary is thrown unchanged; its hook error is dropped', () => {
  const frozen = Object.freeze(new Error('frozen'))
  const wrapped = tryCatchSync(() => {
    throw frozen
  }, {
    onError: () => {
      throw new Error('onError failed')
    },
  })

  let thrown
  try {
    wrapped()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBe(frozen)
  expect(thrown.hookErrors).toBeUndefined()
})

test('a fatal sync-callback violation aborts before onFinally runs', () => {
  const onFinally = vi.fn()
  const wrapped = tryCatchSync(() => 'data', {
    onSuccess: async () => await undefined,
    onFinally,
  })

  expect(() => wrapped())
    .toThrow('tryCatchSync() onSuccess returned a Promise; use tryCatch()')
  expect(onFinally).not.toHaveBeenCalled()
})

test('post-recover: first hook failure stays primary', () => {
  const onErrorError = new Error('onError failed')
  const finallyError = new Error('onFinally failed')
  const wrapped = tryCatchSync(() => {
    throw new Error('op')
  }, {
    onError: () => {
      throw onErrorError
    },
    recover: () => 'recovered',
    onFinally: () => {
      throw finallyError
    },
  })

  let thrown
  try {
    wrapped()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBe(onErrorError)
  expect(thrown.hookErrors).toEqual([finallyError])
})

test('post-recover: later hook failure propagates alone', () => {
  const finallyError = new Error('onFinally failed')
  const wrapped = tryCatchSync(() => {
    throw new Error('op')
  }, {
    recover: () => 'recovered',
    onFinally: () => {
      throw finallyError
    },
  })

  let thrown
  try {
    wrapped()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBe(finallyError)
  expect(thrown.hookErrors).toBeUndefined()
})

test('post-recover: frozen first hook error unchanged', () => {
  const frozen = Object.freeze(new Error('onError failed'))
  const wrapped = tryCatchSync(() => {
    throw new Error('op')
  }, {
    onError: () => {
      throw frozen
    },
    recover: () => 'recovered',
    onFinally: () => {
      throw new Error('onFinally failed')
    },
  })

  let thrown
  try {
    wrapped()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBe(frozen)
  expect(thrown.hookErrors).toBeUndefined()
})

test('a throwing recover keeps the earlier hook error secondary', () => {
  const onErrorError = new Error('onError failed')
  const recoverError = new Error('recover failed')
  const wrapped = tryCatchSync(() => {
    throw new Error('op')
  }, {
    onError: () => {
      throw onErrorError
    },
    recover: () => {
      throw recoverError
    },
  })

  let thrown
  try {
    wrapped()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBe(recoverError)
  expect(thrown.hookErrors).toEqual([onErrorError])
})
