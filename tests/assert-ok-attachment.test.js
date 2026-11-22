import {test, expect} from 'vitest'
import {assertOk} from '$src/index'

const capture = fn => {
  try {
    fn()
  } catch (error) {
    return error
  }

  return undefined
}

const WRAPPED = 'pipelean: operation failed'

test('a non-writable .failure falls back, error untouched', () => {
  const bang = new Error('bang')
  Object.defineProperty(bang, 'failure', {
    value: 1,
    writable: false,
    configurable: false,
  })
  const failure = {item: 1, error: bang, index: 0}

  const thrown = capture(() => assertOk({failure}))

  expect(thrown).not.toBe(bang)
  expect(thrown).toBeInstanceOf(Error)
  expect(thrown.message).toBe(WRAPPED)
  expect(thrown.cause).toBe(bang)
  expect(thrown.failure).toBe(failure)
  expect(bang.failure).toBe(1)
})

test('a setter-less .failure accessor falls back, no crash', () => {
  const bang = new Error('bang')
  Object.defineProperty(bang, 'failure', {
    get: () => 'get-only',
    configurable: false,
  })
  const failure = {item: 1, error: bang, index: 0}

  const thrown = capture(() => assertOk({failure}))

  expect(thrown).not.toBe(bang)
  expect(thrown.message).toBe(WRAPPED)
  expect(thrown.cause).toBe(bang)
  expect(thrown.failure).toBe(failure)
  expect(bang.failure).toBe('get-only')
})

test('a Proxy whose set trap throws falls back to the wrapped error', () => {
  const target = new Error('target bang')
  const proxy = new Proxy(target, {
    set: () => {
      throw new Error('set trap')
    },
  })
  const failure = {item: 1, error: proxy, index: 0}

  const thrown = capture(() => assertOk({failure}))

  expect(thrown).not.toBe(proxy)
  expect(thrown.message).toBe(WRAPPED)
  expect(thrown.cause).toBe(proxy)
  expect(thrown.failure).toBe(failure)
  expect(target.failure).toBeUndefined()
})

test('a Proxy whose isExtensible trap throws falls back, no crash', () => {
  const proxy = new Proxy(new Error('sealed'), {
    isExtensible: () => {
      throw new Error('isExtensible trap')
    },
  })
  const failure = {item: 1, error: proxy, index: 0}

  const thrown = capture(() => assertOk({failure}))

  expect(thrown.message).toBe(WRAPPED)
  expect(thrown.cause).toBe(proxy)
  expect(thrown.failure).toBe(failure)
})

test('an extensible error is still thrown by identity with .failure', () => {
  const bang = new Error('bang')
  const failure = {item: 1, error: bang, index: 0}

  const thrown = capture(() => assertOk({failure}))

  expect(thrown).toBe(bang)
  expect(thrown.failure).toBe(failure)
})

test('a frozen error still falls back to the wrapped error', () => {
  const bang = Object.freeze(new Error('frozen'))
  const failure = {item: 1, error: bang, index: 0}

  const thrown = capture(() => assertOk({failure}))

  expect(thrown).not.toBe(bang)
  expect(thrown.message).toBe(WRAPPED)
  expect(thrown.cause).toBe(bang)
  expect(thrown.failure).toBe(failure)
  expect(bang.failure).toBeUndefined()
})
