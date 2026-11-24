import {test, expect, vi} from 'vitest'
import {
  collect, enrich, failFast, rethrow,
} from '$src/functional'

test('hooks fire start then success, step by step', async () => {
  const order = []

  function loadUser (state) {
    order.push('op:loadUser')
    return {user: state.id}
  }

  function loadPosts (state) {
    order.push('op:loadPosts')
    return {posts: [state.user]}
  }

  await enrich([loadUser, loadPosts], {
    onStepStart: ({operation}) => order.push(`start:${operation}`),
    onStepSuccess: ({operation}) => order.push(`success:${operation}`),
  })({id: 7})

  expect(order).toEqual([
    'start:loadUser',
    'op:loadUser',
    'success:loadUser',
    'start:loadPosts',
    'op:loadPosts',
    'success:loadPosts',
  ])
})

test('async hooks are awaited before and after the operation', async () => {
  const order = []

  await enrich([state => {
    order.push('op')
    return {a: state.a}
  }], {
    onStepStart: async () => {
      await Promise.resolve()
      order.push('start')
    },
    onStepSuccess: async () => {
      await Promise.resolve()
      order.push('success')
    },
  })({a: 1})

  expect(order).toEqual(['start', 'op', 'success'])
})

test('payload shapes use the operation normalization and total', async () => {
  const starts = []
  const successes = []

  function namedStep () {
    return {a: 1}
  }

  await enrich([namedStep, () => ({b: 2})], {
    onStepStart: ctx => starts.push(ctx),
    onStepSuccess: ctx => successes.push(ctx),
  })({})

  expect(starts).toEqual([
    {operation: 'namedStep', index: 0, total: 2},
    {operation: 'operation-1', index: 1, total: 2},
  ])
  expect(successes).toEqual([
    {
      operation: 'namedStep', patch: {a: 1}, index: 0, total: 2,
    },
    {
      operation: 'operation-1', patch: {b: 2}, index: 1, total: 2,
    },
  ])
})

test('a failing step reports onError and no success hook', async () => {
  const onError = vi.fn()
  const onStepStart = vi.fn()
  const onStepSuccess = vi.fn()

  const result = await enrich([
    () => ({a: 1}),
    () => {
      throw new Error('boom')
    },
    () => ({c: 3}),
  ], {onError, onStepStart, onStepSuccess})({})

  expect(onError).toHaveBeenCalledOnce()
  expect(onError.mock.calls[0][0].operation).toBe('operation-1')
  expect(onStepStart).toHaveBeenCalledTimes(3)
  expect(onStepSuccess.mock.calls.map(([ctx]) => ctx.index)).toEqual([0, 2])
  expect(result.errors).toHaveLength(1)
})

test('an invalid patch reports onError and no success hook', async () => {
  const onError = vi.fn()
  const onStepSuccess = vi.fn()

  const result = await enrich([
    () => ({a: 1}),
    () => null,
    () => [1, 2],
  ], {onError, onStepSuccess})({})

  expect(onError).toHaveBeenCalledTimes(2)
  expect(onStepSuccess.mock.calls.map(([ctx]) => ctx.index)).toEqual([0])
  expect(result.value).toEqual({a: 1})
  expect(result.errors).toHaveLength(2)
})

test('a throwing onStepStart goes through the failFast strategy', async () => {
  const error = new Error('start hook')
  const onStepStart = vi
    .fn()
    .mockImplementationOnce(() => {
      throw error
    })
  const second = vi.fn(() => ({b: 2}))

  const result = await enrich([() => ({a: 1}), second], {
    strategy: failFast,
    onStepStart,
  })({})

  expect(result.failure.operation).toBe('operation-0')
  expect(result.failure.error).toBe(error)
  expect(second).not.toHaveBeenCalled()
  expect(onStepStart).toHaveBeenCalledOnce()
})

test('a throwing success hook records under collect, keeps going', async () => {
  const error = new Error('success hook')
  const onStepSuccess = vi
    .fn()
    .mockImplementationOnce(() => {
      throw error
    })

  const result = await enrich([
    () => ({a: 1}),
    () => ({b: 2}),
  ], {strategy: collect, onStepSuccess})({})

  expect(onStepSuccess).toHaveBeenCalledTimes(2)
  expect(result.value).toEqual({b: 2})
  expect(result.errors).toHaveLength(1)
  expect(result.errors[0].operation).toBe('operation-0')
  expect(result.errors[0].error).toBe(error)
})

test('a throwing success hook under rethrow rejects with it', async () => {
  const error = new Error('success hook')

  const pipeline = enrich([() => ({a: 1})], {
    strategy: rethrow,
    onStepSuccess: () => {
      throw error
    },
  })

  await expect(pipeline({})).rejects.toBe(error)
})

test('failFast stops later hooks, collect runs every step', async () => {
  const ops = [
    () => ({a: 1}),
    () => {
      throw new Error('boom')
    },
    () => ({c: 3}),
  ]

  const fastStarts = []
  const fast = await enrich(ops, {
    strategy: failFast,
    onStepStart: ({index}) => fastStarts.push(index),
  })({})

  expect(fastStarts).toEqual([0, 1])
  expect(fast.failure.operation).toBe('operation-1')

  const collectStarts = []
  await enrich(ops, {
    strategy: collect,
    onStepStart: ({index}) => collectStarts.push(index),
  })({})

  expect(collectStarts).toEqual([0, 1, 2])
})

test('a curried pipeline fires hooks on every run', async () => {
  const onStepStart = vi.fn()
  const onStepSuccess = vi.fn()

  const pipeline = enrich([
    state => ({a: state.a + 1}),
    state => ({b: state.a * 2}),
  ], {onStepStart, onStepSuccess})

  expect((await pipeline({a: 1})).value).toEqual({a: 2, b: 4})
  expect((await pipeline({a: 10})).value).toEqual({a: 11, b: 22})
  expect(onStepStart).toHaveBeenCalledTimes(4)
  expect(onStepSuccess).toHaveBeenCalledTimes(4)
})

test('hooks do not change the result shape or value', async () => {
  const steps = [() => ({a: 1}), () => undefined]

  const plain = await enrich(steps)({seed: true})
  const hooked = await enrich(steps, {
    onStepStart: () => undefined,
    onStepSuccess: () => undefined,
  })({seed: true})

  expect(hooked).toEqual(plain)
  expect(hooked).toEqual({
    value: {seed: true, a: 1},
    errors: [
      {
        operation: 'operation-1',
        error: expect.any(TypeError),
        index: 1,
      },
    ],
    sourceErrors: [],
    failure: false,
  })
})
