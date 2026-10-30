import {test, expect} from 'vitest'
import {
  assertOk, failFast, failLate, join, reduce, series, seriesSync,
} from '$src/index'

const capture = fn => {
  try {
    fn()
  } catch (error) {
    return error
  }

  return undefined
}

test('returns the same result object when there is no failure', async () => {
  const result = await series([1, 2], x => x * 2)

  expect(assertOk(result)).toBe(result)
})

test('rejects an un-awaited Promise', async () => {
  const pending = series([1, 2], x => x * 2)

  const thrown = capture(() => assertOk(pending))

  expect(thrown).toBeInstanceOf(TypeError)
  expect(thrown.message).toBe(
    'assertOk() expects an awaited result, not a Promise',
  )

  await pending
})

test('rejects undefined and non-result values', () => {
  const thrownUndefined = capture(() => assertOk(undefined))
  const thrownPlain = capture(() => assertOk({}))

  expect(thrownUndefined).toBeInstanceOf(TypeError)
  expect(thrownUndefined.message).toBe(
    'assertOk() expects a pipelean result',
  )
  expect(thrownPlain).toBeInstanceOf(TypeError)
  expect(thrownPlain.message).toBe('assertOk() expects a pipelean result')
})

test('returns a reduce result unchanged', async () => {
  const result = await reduce([1, 2, 3], (acc, item) => acc + item, 0)

  expect(assertOk(result)).toBe(result)
  expect(result.value).toBe(6)
})

test('failFast throws with cause and the failure object', async () => {
  const bang = new Error('bang')
  const result = await series([1, 2], x => {
    if (x === 2)
      throw bang
    return x
  }, {strategy: failFast})

  const thrown = capture(() => assertOk(result))

  expect(thrown).toBeInstanceOf(Error)
  expect(thrown.message).toBe('pipelean: operation failed')
  expect(thrown.cause).toBe(bang)
  expect(thrown.failure).toBe(result.failure)
  expect(thrown.failure).toEqual({item: 2, error: bang, index: 1})
})

test('a failLate aggregate uses the first error as cause', async () => {
  const first = new Error('first')
  const second = new Error('second')
  const result = await series([1, 2, 3], x => {
    if (x === 1)
      throw first
    if (x === 3)
      throw second
    return x
  }, {strategy: failLate})

  const thrown = capture(() => assertOk(result))

  expect(thrown.cause).toBe(first)
  expect(thrown.failure).toBe(result.failure)
})

test('a reduce failure keeps its value and throws', async () => {
  const bang = new Error('bang')
  const result = await reduce([1, 2], (acc, item) => {
    if (item === 2)
      throw bang
    return acc + item
  }, 0, {strategy: failFast})

  expect(result.value).toBe(1)

  const thrown = capture(() => assertOk(result))
  expect(thrown.cause).toBe(bang)
})

test('works on a synchronous result', () => {
  const bang = new Error('sync bang')
  const result = seriesSync([1], () => {
    throw bang
  }, {strategy: failFast})

  const thrown = capture(() => assertOk(result))
  expect(thrown.cause).toBe(bang)
})

test('collect with errors does not throw: failure, not errors', async () => {
  const result = await series([1, 2], x => {
    if (x === 2)
      throw new Error('boom')
    return x
  })

  expect(result.errors).toHaveLength(1)
  expect(result.failure).toBe(false)
  expect(assertOk(result)).toBe(result)
})

test('a source-error failure works', async () => {
  const sourceBoom = new Error('source boom')

  async function * dying () {
    yield 1
    throw sourceBoom
  }

  const result = await series(dying(), x => x, {strategy: failFast})

  expect(result.failure).toEqual({error: sourceBoom, index: 1})

  const thrown = capture(() => assertOk(result))
  expect(thrown.cause).toBe(sourceBoom)
  expect(thrown.failure).toBe(result.failure)
})

test('works on a join failLate aggregate', async () => {
  const bang = new Error('branch boom')
  const result = await join({
    ok: () => 1,
    bad: () => {
      throw bang
    },
  }, {strategy: failLate})

  const thrown = capture(() => assertOk(result))
  expect(thrown.cause).toBe(bang)
  expect(thrown.failure).toBe(result.failure)
})
