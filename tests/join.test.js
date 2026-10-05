import {test, expect} from 'vitest'
import {delay, join} from '$src/functional'

test('runs named tasks and returns keyed values', async () => {
  const {value, errors, failure} = await join({
    ping: () => 'pong',
    scan: () => 80,
  })

  expect(value).toEqual({ping: 'pong', scan: 80})
  expect(errors).toEqual([])
  expect(failure).toBe(false)
})

test('tasks receive their key and index', async () => {
  const seen = {}
  await join({
    first: (key, index) => {
      seen[key] = index
    },
    second: (key, index) => {
      seen[key] = index
    },
  })

  expect(seen).toEqual({first: 0, second: 1})
})

test('starts every branch before any settles', async () => {
  const started = []
  const finished = []

  await join({
    slow: async () => {
      started.push('slow')
      await delay(20)
      finished.push('slow')
    },
    fast: async () => {
      started.push('fast')
      await delay(5)
      finished.push('fast')
    },
  })

  expect(started).toEqual(['slow', 'fast'])
  expect(finished).toEqual(['fast', 'slow'])
})

test('a synchronous throw is captured as an error', async () => {
  const {value, errors, failure} = await join({
    ok: () => 1,
    boom: () => {
      throw new Error('sync')
    },
  })

  expect(value).toEqual({ok: 1})
  expect(errors).toEqual([
    {operation: 'boom', error: new Error('sync'), index: 1},
  ])
  expect(failure).toBe(false)
})

test('an async rejection is captured as an error', async () => {
  const {value, errors} = await join({
    ok: () => 1,
    nope: () => Promise.reject(new Error('async')),
  })

  expect(value).toEqual({ok: 1})
  expect(errors).toHaveLength(1)
  expect(errors[0].operation).toBe('nope')
})

test('a branch resolving undefined is still a success', async () => {
  const {value, errors} = await join({
    maybe: () => undefined,
  })

  expect(Object.hasOwn(value, 'maybe')).toBe(true)
  expect(value.maybe).toBeUndefined()
  expect(errors).toEqual([])
})

test('empty record resolves to an empty envelope', async () => {
  await expect(join({})).resolves.toEqual({
    value: {}, errors: [], failure: false,
  })
})

test('errors keep declaration order even when completion order differs',
  async () => {
    const {errors} = await join({
      slow: async () => {
        await delay(20)
        throw new Error('slow')
      },
      fast: async () => {
        await delay(5)
        throw new Error('fast')
      },
    })

    expect(errors.map(({operation}) => operation)).toEqual(['slow', 'fast'])
  })

test('onError receives the normalized context without changing flow',
  async () => {
    const seen = []
    const {errors} = await join({
      a: () => {
        throw new Error('a')
      },
    }, {onError: ctx => seen.push(ctx)})

    expect(seen).toEqual([{operation: 'a', error: new Error('a'), index: 0}])
    expect(errors).toHaveLength(1)
  })

test('validation: array throws TypeError', async () => {
  await expect(join([() => 1])).rejects.toThrow(TypeError)
})

test('validation: null throws TypeError', async () => {
  await expect(join(null)).rejects.toThrow(TypeError)
})

test('validation: non-function value throws TypeError naming the key',
  async () => {
    await expect(join({ping: 'nope'})).rejects.toThrow('ping')
  })

test('validation failure starts no branch', async () => {
  let started = false

  await expect(join({
    ok: () => {
      started = true
    },
    bad: 42,
  })).rejects.toThrow(TypeError)

  expect(started).toBe(false)
})

test('validation: a thenable (un-awaited Promise) throws TypeError',
  async () => {
    await expect(
      join(Promise.resolve({a: () => 1})),
    ).rejects.toThrow(TypeError)
  })

test('a record with a branch named then is still valid', async () => {
  const {value} = await join({then: () => 1})

  expect(value).toEqual({then: 1})
})
