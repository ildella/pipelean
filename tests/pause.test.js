import {
  test, expect, vi, afterEach,
} from 'vitest'
import {
  failLate, filterSync, findSync, reduce, scanSync, series, seriesSync,
} from '$src/functional'

afterEach(() => {
  vi.useRealTimers()
})

test('series function pause gets (item, index) and is awaited', async () => {
  const calls = []
  const order = []

  await series([10, 20], item => {
    order.push(`fn:${item}`)
    return item
  }, {
    pause: async (item, index) => {
      await Promise.resolve()
      calls.push([item, index])
      order.push(`pause:${item}`)
      return 0
    },
  })

  expect(calls).toEqual([[10, 0], [20, 1]])
  expect(order).toEqual(['fn:10', 'pause:10', 'fn:20', 'pause:20'])
})

test('fold pause sees new accumulator, item and index', async () => {
  const calls = []
  const {value} = await reduce([1, 2], (acc, item) => acc + item, 0, {
    pause: (acc, item, index) => {
      calls.push([acc, item, index])
      return 0
    },
  })

  expect(value).toBe(3)
  expect(calls).toEqual([[1, 1, 0], [3, 2, 1]])
})

test('fold pause accepts a number', async () => {
  vi.useFakeTimers()
  let done = false

  const promise = reduce([1], (acc, item) => acc + item, 0, {pause: 100})
    .then(result => {
      done = true
      return result
    })

  await vi.advanceTimersByTimeAsync(0)
  expect(done).toBe(false)

  await vi.advanceTimersByTimeAsync(100)
  const {value} = await promise

  expect(done).toBe(true)
  expect(value).toBe(1)
})

test('fold pauseOnErrors pauses after collected errors', async () => {
  const pause = vi.fn(() => 0)
  const scanner = (acc, item) => {
    if (item === 2)
      throw new Error('boom')
    return acc + item
  }

  await reduce([1, 2, 3], scanner, 0, {
    strategy: 'collect', pause, pauseOnErrors: true,
  })
  expect(pause).toHaveBeenCalledTimes(3)

  pause.mockClear()
  await reduce([1, 2, 3], scanner, 0, {
    strategy: 'collect', pause,
  })
  expect(pause).toHaveBeenCalledTimes(2)
})

test('fold pauseOnErrors also pauses after skip', async () => {
  const pause = vi.fn(() => 0)

  await reduce([1, 2], () => {
    throw new Error('boom')
  }, 0, {
    strategy: 'skip', pause, pauseOnErrors: true,
  })

  expect(pause).toHaveBeenCalledTimes(2)
})

test('series pauseOnErrors pauses after a handled error', async () => {
  const pause = vi.fn(() => 0)

  await series([1, 2, 3], item => {
    if (item === 2)
      throw new Error('boom')
    return item
  }, {strategy: 'collect', pause, pauseOnErrors: true})

  expect(pause).toHaveBeenCalledTimes(3)
})

test('series skip keeps pausing even without pauseOnErrors', async () => {
  const pause = vi.fn(() => 0)

  await series([1, 2, 3], item => {
    if (item === 2)
      throw new Error('boom')
    return item
  }, {strategy: 'skip', pause})

  expect(pause).toHaveBeenCalledTimes(3)
})

test.each([0, undefined, Number.NaN])(
  'pause resolving to %s does not wait',
  async value => {
    vi.useFakeTimers()

    const promise = series([1, 2], x => x, {pause: () => value})
    await vi.advanceTimersByTimeAsync(0)

    const result = await promise
    expect(result.results).toEqual([1, 2])
  },
)

test('a throwing pause is a source error, not an item error', async () => {
  const bang = new Error('pause boom')
  const onError = vi.fn()
  const onSourceError = vi.fn()

  const result = await series([1, 2], x => x, {
    pause: () => {
      throw bang
    },
    onError,
    onSourceError,
  })

  expect(result.results).toEqual([1])
  expect(result.sourceErrors).toEqual([{error: bang, index: 0}])
  expect(onError).not.toHaveBeenCalled()
  expect(onSourceError).toHaveBeenCalledWith({error: bang, index: 0})
})

test('a throwing fold pause preserves the accumulator', async () => {
  const bang = new Error('pause boom')
  const result = await reduce([1, 2, 3], (acc, item) => acc + item, 0, {
    pause: () => {
      throw bang
    },
  })

  expect(result.value).toBe(1)
  expect(result.sourceErrors).toEqual([{error: bang, index: 0}])
  expect(result.failure).toEqual({error: bang, index: 0})
})

test('pause composes with failLate', async () => {
  const pause = vi.fn(() => 0)
  const {failure} = await reduce([1, 2], (acc, item) => {
    if (item === 2)
      throw new Error('boom')
    return acc + item
  }, 0, {strategy: failLate, pause, pauseOnErrors: true})

  expect(failure).toEqual({
    errors: [{item: 2, error: new Error('boom'), index: 1}],
  })
})

const newSignal = () => new AbortController().signal

const syncRun = opts => () => seriesSync([1], x => x, opts)
const syncFoldRun = opts => () => scanSync([1], x => x, 0, opts)
const findRun = opts => () => findSync([1], x => x, opts)

test.each([
  ['seriesSync pause', syncRun({pause: 1})],
  ['seriesSync signal', syncRun({signal: newSignal()})],
  ['seriesSync pauseOnErrors', syncRun({pauseOnErrors: false})],
  ['filterSync pause', () => filterSync([1], x => x, {pause: 1})],
  ['scanSync pause', syncFoldRun({pause: 1})],
  ['reduceSync signal', syncFoldRun({signal: newSignal()})],
  ['findSync pause', findRun({pause: 1})],
  ['findSync signal', findRun({signal: newSignal()})],
  ['findSync pauseOnErrors', findRun({pauseOnErrors: false})],
])('%s rejects async-only options', (_name, run) => {
  expect(run).toThrow(TypeError)
})

test.each([
  ['a string pause', {pause: '10'}],
  ['a NaN pause', {pause: Number.NaN}],
  ['an infinite pause', {pause: Infinity}],
  ['a plain object signal', {signal: {}}],
  ['a number signal', {signal: 42}],
])('series rejects %s', (_name, opts) => {
  expect(() => series([1], x => x, opts)).toThrow(TypeError)
})

test('reduce validates signal and pause too', () => {
  expect(() => reduce([1], x => x, 0, {signal: {}})).toThrow(TypeError)
  expect(() => reduce([1], x => x, 0, {pause: 'nope'})).toThrow(TypeError)
})
