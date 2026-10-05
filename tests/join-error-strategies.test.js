import {test, expect} from 'vitest'
import {
  delay, failFast, failLate, join, rethrow, skip, stopOnError,
} from '$src/functional'

test('collect (default) keeps errors as data and failure false', async () => {
  const {value, errors, failure} = await join({
    ok: () => 1,
    bad: () => {
      throw new Error('bad')
    },
  })

  expect(value).toEqual({ok: 1})
  expect(errors).toHaveLength(1)
  expect(errors[0].operation).toBe('bad')
  expect(failure).toBe(false)
})

test('failLate collects errors and signals failure at end', async () => {
  const {value, errors, failure} = await join({
    ok: () => 1,
    a: () => {
      throw new Error('a')
    },
    b: () => {
      throw new Error('b')
    },
  }, {strategy: failLate})

  expect(value).toEqual({ok: 1})
  expect(errors).toHaveLength(2)
  expect(failure).toEqual({errors})
})

test('failFast behaves as failLate because branches cannot be stopped',
  async () => {
    const result = await join({
      a: () => {
        throw new Error('a')
      },
    }, {strategy: failFast})

    expect(result.errors).toHaveLength(1)
    expect(result.failure).toEqual({errors: result.errors})
  })

test('stopOnError alias also behaves as failLate', async () => {
  const {failure} = await join({
    a: () => {
      throw new Error('a')
    },
  }, {strategy: stopOnError})

  expect(failure).not.toBe(false)
})

test('skip keeps errors empty but still reports onError', async () => {
  const seen = []
  const {value, errors, failure} = await join({
    ok: () => 1,
    bad: () => {
      throw new Error('bad')
    },
  }, {strategy: skip, onError: ctx => seen.push(ctx.operation)})

  expect(value).toEqual({ok: 1})
  expect(errors).toEqual([])
  expect(seen).toEqual(['bad'])
  expect(failure).toBe(false)
})

test('rethrow throws the first error by declaration order', async () => {
  await expect(join({
    first: () => {
      throw new Error('first')
    },
    second: () => {
      throw new Error('second')
    },
  }, {strategy: rethrow})).rejects.toThrow('first')
})

test('rethrow waits for every branch to settle (no orphans)', async () => {
  let slowSettled = false

  await expect(join({
    fast: () => {
      throw new Error('boom')
    },
    slow: async () => {
      await delay(20)
      slowSettled = true
    },
  }, {strategy: rethrow})).rejects.toThrow('boom')

  expect(slowSettled).toBe(true)
})

test('onFailure fires with the collected errors', async () => {
  const failures = []

  await join({
    a: () => {
      throw new Error('a')
    },
  }, {strategy: failLate, onFailure: failure => failures.push(failure)})

  expect(failures).toHaveLength(1)
  expect(failures[0].errors).toHaveLength(1)
})

test('awaits an async onFailure before resolving', async () => {
  const seen = []

  await join({
    a: () => {
      throw new Error('a')
    },
  }, {
    strategy: failLate,
    onFailure: async failure => {
      await delay(5)
      seen.push(failure.errors.length)
    },
  })

  expect(seen).toEqual([1])
})

test('a rejecting onFailure rejects the join', async () => {
  await expect(join({
    a: () => {
      throw new Error('a')
    },
  }, {
    strategy: failLate,
    onFailure: () => Promise.reject(new Error('telemetry exploded')),
  })).rejects.toThrow('telemetry exploded')
})
