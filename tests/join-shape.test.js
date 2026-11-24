import {test, expect} from 'vitest'
import {
  failFast, failLate, join, rethrow, skip,
} from '$src/functional'

test('success envelope has all four keys', async () => {
  const result = await join({a: () => 1})

  expect(result).toEqual({
    value: {a: 1}, errors: [], sourceErrors: [], failure: false,
  })
  expect(Object.keys(result)).toEqual([
    'value', 'errors', 'sourceErrors', 'failure',
  ])
})

test('error context is {operation, error, index}', async () => {
  const {errors} = await join({
    ping: () => {
      throw new Error('e')
    },
  })

  expect(errors[0]).toEqual({
    operation: 'ping', error: new Error('e'), index: 0,
  })
  expect(Object.keys(errors[0])).toEqual(['operation', 'error', 'index'])
})

test('operation name is the record key, not the function name', async () => {
  const pingServer = () => {
    throw new Error('e')
  }
  const {errors} = await join({hostA: pingServer})

  expect(errors[0].operation).toBe('hostA')
})

test('value only holds successful branches', async () => {
  const {value} = await join({
    up: () => 'ok',
    down: () => {
      throw new Error('down')
    },
  })

  expect(value).toEqual({up: 'ok'})
  expect(Object.hasOwn(value, 'down')).toBe(false)
})

test('failure envelopes keep all four keys under every strategy', async () => {
  const failing = () => {
    throw new Error('e')
  }

  const results = await Promise.all(
    [failLate, failFast, skip].map(strategy =>
      join({a: failing}, {strategy})),
  )

  for (const result of results) {
    expect(Object.keys(result)).toEqual([
      'value', 'errors', 'sourceErrors', 'failure',
    ])
    expect(result.sourceErrors).toEqual([])
  }

  const thrown = await join({a: () => 1}, {strategy: rethrow})

  expect(Object.keys(thrown)).toEqual([
    'value', 'errors', 'sourceErrors', 'failure',
  ])
})
