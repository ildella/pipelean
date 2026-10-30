import {
  test, expect, vi, afterEach,
} from 'vitest'
import {reduce, rethrow, scan} from '$src/index'

afterEach(() => {
  vi.useRealTimers()
})

const boom = item => {
  if (item === 2)
    throw new Error('boom')
  return item
}

test('a recovered error becomes the next accumulator', async () => {
  const result = await reduce([1, 2, 3], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {
    strategy: 'collect',
    recover: ({state}) => state + 100,
  })

  expect(result).toEqual({
    value: 104, errors: [], sourceErrors: [], failure: false,
  })
})

test('scan pushes recovered states into results', async () => {
  const {results, errors, failure} = await scan([1, 2, 3], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {
    strategy: 'collect',
    recover: ({state}) => state + 1,
  })

  expect(results).toEqual([1, 2, 5])
  expect(errors).toEqual([])
  expect(failure).toBe(false)
})

test('onError fires under rethrow when recover is present', async () => {
  const onError = vi.fn()
  const onFailure = vi.fn()

  const result = await reduce([1, 2], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {
    strategy: rethrow,
    onError,
    onFailure,
    recover: ({state}) => state + 10,
  })

  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError.mock.calls[0][0].item).toBe(2)
  expect(onFailure).not.toHaveBeenCalled()
  expect(result.value).toBe(11)
  expect(result.errors).toEqual([])
})

test('rethrow without recover still skips onError', async () => {
  const onError = vi.fn()

  await expect(reduce([1, 2], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {strategy: rethrow, onError}))
    .rejects.toThrow('boom')

  expect(onError).not.toHaveBeenCalled()
})

test('recover receives error, item, index, state and total', async () => {
  const error = new Error('boom')
  const contexts = []

  await reduce([1, 2, 3], (acc, item) => {
    if (item === 2)
      throw error
    return acc + item
  }, 1, {
    recover: context => {
      contexts.push(context)
      return context.state
    },
  })

  expect(contexts).toHaveLength(1)
  expect(contexts[0]).toEqual({
    error, item: 2, index: 1, state: 2, total: 3,
  })
})

test('total is omitted from the recover context when unknown', async () => {
  async function * ticks () {
    yield 1
    yield 2
  }

  const contexts = []
  await reduce(ticks(), (acc, item) => {
    if (item === 2)
      throw new Error('boom')
    return acc + item
  }, 0, {
    recover: context => {
      contexts.push(context)
      return context.state
    },
  })

  expect(contexts[0]).not.toHaveProperty('total')
})

test('an async recover is awaited', async () => {
  const order = []

  const {value} = await reduce([1, 2], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {
    recover: async ({state}) => {
      await Promise.resolve()
      order.push('recover')
      return state + 5
    },
    pause: () => {
      order.push('pause')
      return 0
    },
  })

  expect(value).toBe(6)
  expect(order).toEqual(['pause', 'recover', 'pause'])
})

test('pause sees the recovered state without pauseOnErrors', async () => {
  const pause = vi.fn(() => 0)

  const {value} = await reduce([1, 2, 3], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {
    strategy: 'collect',
    recover: ({state}) => state + 10,
    pause,
  })

  expect(value).toBe(14)
  expect(pause).toHaveBeenCalledTimes(3)
  expect(pause.mock.calls[1][0]).toBe(11)
  expect(pause.mock.calls[1][1]).toBe(2)
})

test('abort during recovery keeps the state and skips the pause', async () => {
  const controller = new AbortController()
  const pause = vi.fn(() => 0)
  const scanner = vi.fn((acc, item) => {
    if (item === 2)
      throw new Error('boom')
    return acc + item
  })

  const {value, failure} = await reduce([1, 2, 3], scanner, 0, {
    signal: controller.signal,
    recover: ({state}) => {
      controller.abort()
      return state + 7
    },
    pause,
  })

  expect(scanner).toHaveBeenCalledTimes(2)
  expect(value).toBe(8)
  expect(failure).toBe(false)
  expect(pause).toHaveBeenCalledTimes(1)
  expect(pause.mock.calls[0][0]).toBe(1)
})

test('a source error bypasses recover', async () => {
  const sourceBoom = new Error('source boom')
  const recover = vi.fn(() => 0)
  const onSourceError = vi.fn()

  async function * dying () {
    yield 1
    throw sourceBoom
  }

  const result = await reduce(dying(), (acc, item) => acc + item, 0, {
    strategy: 'collect',
    recover,
    onSourceError,
  })

  expect(recover).not.toHaveBeenCalled()
  expect(result.value).toBe(1)
  expect(result.sourceErrors).toEqual([{error: sourceBoom, index: 1}])
  expect(onSourceError).toHaveBeenCalledTimes(1)
})
