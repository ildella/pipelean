import {test, expect} from 'vitest'
import {
  collect, enrichSync, failFast, failLate, filterSync, findSync,
  mapSeriesSync, reduceSync, scanSync, seriesSync,
} from '$src/index'

const asyncNoop = async () => await undefined

const fragileSource = error => (function * () {
  yield 1
  throw error
})()

test('seriesSync rejects an async onError, even under collect', () => {
  const run = () => seriesSync([1], () => {
    throw new Error('boom')
  }, {strategy: collect, onError: asyncNoop})

  expect(run).toThrow(
    'seriesSync() onError returned a Promise; use series()',
  )
})

test('seriesSync rejects an async onProgress', () => {
  const run = () => seriesSync([1], x => x, {onProgress: asyncNoop})

  expect(run).toThrow(
    'seriesSync() onProgress returned a Promise; use series()',
  )
})

test('seriesSync rejects an async onFailure on the failFast path', () => {
  const run = () => seriesSync([1], () => {
    throw new Error('boom')
  }, {strategy: failFast, onFailure: asyncNoop})

  expect(run).toThrow(
    'seriesSync() onFailure returned a Promise; use series()',
  )
})

test('seriesSync rejects an async onFailure on the failLate path', () => {
  const run = () => seriesSync([1], () => {
    throw new Error('boom')
  }, {strategy: failLate, onFailure: asyncNoop})

  expect(run).toThrow(
    'seriesSync() onFailure returned a Promise; use series()',
  )
})

test('seriesSync rejects an async onSourceError', () => {
  const items = fragileSource(new Error('boom'))
  const run = () => seriesSync(items, x => x, {onSourceError: asyncNoop})

  expect(run).toThrow(
    'seriesSync() onSourceError returned a Promise; use series()',
  )
})

test('scanSync rejects an async onError, naming scan', () => {
  const run = () => scanSync([1], () => {
    throw new Error('boom')
  }, 0, {strategy: collect, onError: asyncNoop})

  expect(run).toThrow(
    'scanSync() onError returned a Promise; use scan()',
  )
})

test('reduceSync rejects an async onFailure, naming reduce', () => {
  const run = () => reduceSync([1], () => {
    throw new Error('boom')
  }, 0, {onFailure: asyncNoop})

  expect(run).toThrow(
    'reduceSync() onFailure returned a Promise; use reduce()',
  )
})

test('filterSync names filter in a telemetry message', () => {
  const run = () => filterSync([1], () => {
    throw new Error('boom')
  }, {strategy: collect, onError: asyncNoop})

  expect(run).toThrow(
    'filterSync() onError returned a Promise; use filter()',
  )
})

test('findSync points at filter in a source-error message', () => {
  const items = fragileSource(new Error('boom'))
  const run = () => findSync(items, () => false, {
    onSourceError: asyncNoop,
  })

  expect(run).toThrow(
    'findSync() onSourceError returned a Promise; use filter()',
  )
})

test('mapSeriesSync names mapSeries in a progress message', () => {
  const run = () => mapSeriesSync([1], x => x, {onProgress: asyncNoop})

  expect(run).toThrow(
    'mapSeriesSync() onProgress returned a Promise; use mapSeries()',
  )
})

test('enrichSync names enrich in a telemetry message', () => {
  const run = enrichSync([() => {
    throw new Error('boom')
  }], {strategy: collect, onError: asyncNoop})

  expect(() => run({})).toThrow(
    'enrichSync() onError returned a Promise; use enrich()',
  )
})

test('the telemetry violation is a TypeError that escapes collect', () => {
  let thrown
  try {
    seriesSync([1], () => {
      throw new Error('boom')
    }, {strategy: collect, onError: asyncNoop})
  } catch (error) {
    thrown = error
  }

  expect(thrown).toBeInstanceOf(TypeError)
})

test('sync telemetry callbacks still run unchanged', () => {
  const progress = []
  const errors = []
  const failures = []

  const result = seriesSync([1, 2], x => {
    if (x === 2)
      throw new Error('boom')
    return x
  }, {
    strategy: failLate,
    onProgress: ({index}) => progress.push(index),
    onError: ({index}) => errors.push(index),
    onFailure: failure => failures.push(failure.errors.length),
  })

  expect(progress).toEqual([0])
  expect(errors).toEqual([1])
  expect(failures).toEqual([1])
  expect(result.failure.errors).toHaveLength(1)
})
