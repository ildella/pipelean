import {test, expect, vi} from 'vitest'
import {
  collect, failFast, failLate, filter, reduce, rethrow, scan, series,
  scanSync, seriesSync,
} from '$src/index'
import {fragileSource} from './source-errors-helpers'

const telemetryError = new Error('telemetry boom')
const throwTelemetry = () => {
  throw telemetryError
}

const failingAt = bad => value => {
  if (value === bad)
    throw new Error(`item boom at ${bad}`)
  return value
}

const fragileSyncSource = (values, error) => (function * () {
  yield * values
  throw error
})()

const scanUntil = bad => (accumulator, value) => {
  if (value === bad)
    throw new Error(`item boom at ${bad}`)
  return accumulator + value
}

const options = strategy => ({strategy, onError: throwTelemetry})

test('series: a throwing onError is a source error', async () => {
  const result = await series([10, 20, 30], failingAt(20), options(collect))

  expect(result.results).toEqual([10])
  expect(result.errors).toEqual([])
  expect(result.sourceErrors).toEqual([{error: telemetryError, index: 1}])
  expect(result.failure).toBe(false)
})

test('series: under failFast a throwing onError is the failure', async () => {
  const result = await series([10, 20], failingAt(20), options(failFast))

  expect(result.results).toEqual([])
  expect(result.sourceErrors).toEqual([{error: telemetryError, index: 1}])
  expect(result.failure).toEqual({error: telemetryError, index: 1})
})

test('failLate: onError throw merges into failure', async () => {
  const result = await series([10, 20], failingAt(20), options(failLate))

  expect(result.results).toEqual([10])
  expect(result.failure).toEqual({
    errors: [{error: telemetryError, index: 1}],
  })
})

test('series: under rethrow a throwing onError never runs', async () => {
  const onError = vi.fn(throwTelemetry)
  const run = series([10, 20], failingAt(20), {strategy: rethrow, onError})

  await expect(run).rejects.toThrow('item boom at 20')
  expect(onError).not.toHaveBeenCalled()
})

test('seriesSync classifies a throwing onError like series', async () => {
  const input = [10, 20, 30]
  const asyncResult = await series(input, failingAt(20), options(collect))
  const syncResult = seriesSync(input, failingAt(20), options(collect))

  expect(syncResult).toEqual(asyncResult)
})

test('failFast: seriesSync keeps the same shape', () => {
  const result = seriesSync([10, 20], failingAt(20), options(failFast))

  expect(result.sourceErrors).toEqual([{error: telemetryError, index: 1}])
  expect(result.failure).toEqual({error: telemetryError, index: 1})
})

test('onProgress: a throw is handled as the current item error', async () => {
  const result = await series([10, 20, 30], value => value, {
    strategy: collect,
    onProgress: throwTelemetry,
  })

  expect(result.results).toEqual([])
  expect(result.errors).toEqual([
    {item: 10, error: telemetryError, index: 0},
    {item: 20, error: telemetryError, index: 1},
    {item: 30, error: telemetryError, index: 2},
  ])
  expect(result.sourceErrors).toEqual([])
  expect(result.failure).toBe(false)
})

test('onProgress: under rethrow the throw rejects the run', async () => {
  const run = series([10], value => value, {
    strategy: rethrow,
    onProgress: throwTelemetry,
  })

  await expect(run).rejects.toBe(telemetryError)
})

test('seriesSync: a throwing onProgress is an item error as well', () => {
  const result = seriesSync([10, 20], value => value, {
    strategy: collect,
    onProgress: throwTelemetry,
  })

  expect(result.errors.map(context => context.item)).toEqual([10, 20])
  expect(result.sourceErrors).toEqual([])
})

test('onFailure: throw escapes under failFast and failLate', async () => {
  const withFailure = strategy =>
    series([10, 20], failingAt(20), {strategy, onFailure: throwTelemetry})
  const strategies = [failFast, failLate]
  const outcomes = await Promise.allSettled(strategies.map(withFailure))
  const reasons = outcomes.map(outcome => outcome.reason)

  expect(reasons).toEqual([telemetryError, telemetryError])
})

test('onSourceError: a throw escapes instead of being recorded', async () => {
  const onFailure = vi.fn()
  const items = fragileSource([10], new Error('source boom'))
  const run = series(items, value => value, {
    strategy: collect,
    onSourceError: throwTelemetry,
    onFailure,
  })

  await expect(run).rejects.toBe(telemetryError)
  expect(onFailure).not.toHaveBeenCalled()
})

test('onSourceError: rethrow keeps the source error, no callback', async () => {
  const sourceError = new Error('source boom')
  const onSourceError = vi.fn(throwTelemetry)
  const run = series(fragileSource([10], sourceError), value => value, {
    strategy: rethrow,
    onSourceError,
  })

  await expect(run).rejects.toBe(sourceError)
  expect(onSourceError).not.toHaveBeenCalled()
})

test('scan: a throwing onError becomes a source error', async () => {
  const result = await scan([10, 20, 30], scanUntil(20), 0, options(collect))

  expect(result.results).toEqual([10])
  expect(result.errors).toEqual([])
  expect(result.sourceErrors).toEqual([{error: telemetryError, index: 1}])
})

test('filter: a throwing onError becomes a source error', async () => {
  const predicate = value => {
    if (value === 20)
      throw new Error('predicate boom')
    return true
  }
  const result = await filter([10, 20, 30], predicate, options(collect))

  expect(result.results).toEqual([10])
  expect(result.sourceErrors).toEqual([{error: telemetryError, index: 1}])
})

test('reduce: failFast keeps the accumulator when onError throws', async () => {
  const result = await reduce([10, 20], scanUntil(20), 0, options(failFast))

  expect(result.value).toBe(10)
  expect(result.sourceErrors).toEqual([{error: telemetryError, index: 1}])
  expect(result.failure).toEqual({error: telemetryError, index: 1})
})

test('scanSync classifies a throwing onError like scan', async () => {
  const input = [10, 20, 30]
  const asyncResult = await scan(input, scanUntil(20), 0, options(collect))
  const syncResult = scanSync(input, scanUntil(20), 0, options(collect))

  expect(syncResult).toEqual(asyncResult)
})

test('sync telemetry: onSourceError and onFailure throws escape', () => {
  const source = fragileSyncSource([10], new Error('source boom'))

  expect(() => seriesSync(source, value => value, {
    onSourceError: throwTelemetry,
  })).toThrow(telemetryError)

  expect(() => seriesSync([10, 20], failingAt(20), {
    strategy: failFast,
    onFailure: throwTelemetry,
  })).toThrow(telemetryError)
})
