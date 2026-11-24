/* eslint-disable max-lines */
import {
  test, expect, vi, afterEach,
} from 'vitest'
import {
  failFast, failLate, filter, reduce, series, scan,
} from '$src/functional'
import {forever, stopWhen} from '$src/iterables'

afterEach(() => {
  vi.useRealTimers()
})

const aborted = () => {
  const controller = new AbortController()
  controller.abort()

  return controller.signal
}

const countingSource = values => {
  const state = {pulled: 0}
  const gen = async function * () {
    for (const value of values) {
      state.pulled++
      yield value
    }
  }

  return {items: gen(), state}
}

test('series aborted before start processes zero items', async () => {
  const fn = vi.fn(x => x)
  const result = await series([1, 2, 3], fn, {signal: aborted()})

  expect(fn).not.toHaveBeenCalled()
  expect(result).toEqual({
    results: [], errors: [], sourceErrors: [], failure: false,
  })
})

test('a pre-aborted signal never pulls from the source', async () => {
  const {items, state} = countingSource([1, 2, 3])
  const result = await series(items, x => x, {signal: aborted()})

  expect(result).toEqual({
    results: [], errors: [], sourceErrors: [], failure: false,
  })
  expect(state.pulled).toBe(0)
})

test('a pre-aborted signal never starts a dying source', async () => {
  const boom = new Error('never pulled')
  // eslint-disable-next-line require-yield
  const source = async function * () {
    throw boom
  }

  const result = await series(source(), x => x, {signal: aborted()})

  expect(result).toEqual({
    results: [], errors: [], sourceErrors: [], failure: false,
  })
})

test('reduce aborted before start keeps the initial value', async () => {
  const scanner = vi.fn((acc, item) => acc + item)
  const result = await reduce([1, 2, 3], scanner, 42, {signal: aborted()})

  expect(scanner).not.toHaveBeenCalled()
  expect(result).toEqual({
    value: 42, errors: [], sourceErrors: [], failure: false,
  })
})

test('a pre-aborted signal never pulls for scan or reduce', async () => {
  const sum = (acc, item) => acc + item
  const scannedSource = countingSource([1, 2])
  const scanned = await scan(scannedSource.items, sum, 0, {
    signal: aborted(),
  })

  expect(scanned).toEqual({
    results: [], errors: [], sourceErrors: [], failure: false,
  })
  expect(scannedSource.state.pulled).toBe(0)

  const reducedSource = countingSource([1, 2])
  const reduced = await reduce(reducedSource.items, sum, 0, {
    signal: aborted(),
  })

  expect(reduced).toEqual({
    value: 0, errors: [], sourceErrors: [], failure: false,
  })
  expect(reducedSource.state.pulled).toBe(0)
})

test('abort between items keeps completed results', async () => {
  const controller = new AbortController()
  const result = await series([1, 2, 3], x => {
    if (x === 2)
      controller.abort()
    return x * 10
  }, {signal: controller.signal})

  expect(result).toEqual({
    results: [10, 20], errors: [], sourceErrors: [], failure: false,
  })
})

test('abort during an in-flight scanner keeps its accumulator', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  let release
  const gate = new Promise(resolve => {
    release = resolve
  })
  const pause = vi.fn(() => 1000)

  const promise = reduce([1, 2, 3], async (acc, item) => {
    if (item === 1)
      await gate
    return acc + item
  }, 0, {signal: controller.signal, pause})

  await vi.advanceTimersByTimeAsync(0)
  controller.abort()
  release()

  const result = await promise

  expect(result.value).toBe(1)
  expect(result.failure).toBe(false)
  expect(pause).not.toHaveBeenCalled()
})

test('abort during a long pause stops with no extra round', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const fn = vi.fn(x => x)

  const promise = series([1, 2, 3], fn, {
    signal: controller.signal, pause: 10_000,
  })

  await vi.advanceTimersByTimeAsync(0)
  expect(fn).toHaveBeenCalledTimes(1)

  controller.abort()
  const result = await promise

  expect(result).toEqual({
    results: [1], errors: [], sourceErrors: [], failure: false,
  })
  expect(fn).toHaveBeenCalledTimes(1)
})

test('abort during pause does not pull the next item', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const {items, state} = countingSource([1, 2, 3])

  const promise = series(items, x => x, {
    signal: controller.signal, pause: 10_000,
  })

  await vi.advanceTimersByTimeAsync(0)
  expect(state.pulled).toBe(1)

  controller.abort()
  const result = await promise

  expect(result.results).toEqual([1])
  expect(state.pulled).toBe(1)
})

test('abort during step does not pull the next item', async () => {
  const controller = new AbortController()
  const {items, state} = countingSource([1, 2, 3])

  const result = await series(items, x => {
    controller.abort()
    return x
  }, {signal: controller.signal})

  expect(result.results).toEqual([1])
  expect(state.pulled).toBe(1)
})

test('abort during a fold pause keeps the accumulator', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const scanner = vi.fn((acc, item) => acc + item)

  const promise = reduce([1, 2, 3], scanner, 0, {
    signal: controller.signal, pause: 10_000,
  })

  await vi.advanceTimersByTimeAsync(0)
  expect(scanner).toHaveBeenCalledTimes(1)

  controller.abort()
  const result = await promise

  expect(result).toEqual({
    value: 1, errors: [], sourceErrors: [], failure: false,
  })
  expect(scanner).toHaveBeenCalledTimes(1)
})

test('filter and scan both abort cleanly', async () => {
  const controller = new AbortController()
  const filtered = await filter([1, 2, 3], x => {
    if (x === 2)
      controller.abort()
    return x % 2 === 0
  }, {signal: controller.signal})

  expect(filtered.results).toEqual([2])

  const scannerController = new AbortController()
  const scanned = await scan([1, 2, 3], (acc, item) => {
    if (item === 2)
      scannerController.abort()
    return acc + item
  }, 0, {signal: scannerController.signal})

  expect(scanned.results).toEqual([1, 3])
  expect(scanned.failure).toBe(false)
})

test('signal composes with stopWhen', async () => {
  const controller = new AbortController()
  const result = await series(
    stopWhen([1, 2, 3, 4], n => n === 3),
    x => {
      if (x === 2)
        controller.abort()
      return x
    },
    {signal: controller.signal},
  )

  expect(result).toEqual({
    results: [1, 2], errors: [], sourceErrors: [], failure: false,
  })
})

test('signal composes with take', async () => {
  const controller = new AbortController()
  const result = await series([1, 2, 3], x => {
    if (x === 1)
      controller.abort()
    return x
  }, {take: 2, signal: controller.signal})

  expect(result).toEqual({
    results: [1], errors: [], sourceErrors: [], failure: false,
  })
})

test.each([
  ['collect', undefined, false],
  ['failFast', failFast, false],
  ['failLate', failLate, false],
])('abort stays clean under the %s strategy', async (_name, strategy) => {
  const result = await series([1, 2, 3], x => x, {
    strategy, signal: aborted(),
  })

  expect(result).toEqual({
    results: [], errors: [], sourceErrors: [], failure: false,
  })
})

test('abort resolves cleanly under rethrow (no throw)', async () => {
  await expect(series([1, 2, 3], x => x, {
    strategy: 'rethrow', signal: aborted(),
  })).resolves.toEqual({
    results: [], errors: [], sourceErrors: [], failure: false,
  })
})

test('the service loop shape needs no stopWhen or manual sleep', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  let rounds = 0
  const state = {rounds: 0}

  const promise = reduce(forever(), async current => {
    await Promise.resolve()
    rounds++
    if (rounds === 2)
      controller.abort()
    return {...current, rounds}
  }, state, {
    signal: controller.signal,
    pause: 1000,
    strategy: 'rethrow',
  })

  await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(1000)

  const result = await promise

  expect(rounds).toBe(2)
  expect(result.value).toEqual({rounds: 2})
  expect(result).toEqual({
    value: {rounds: 2}, errors: [], sourceErrors: [], failure: false,
  })
})
