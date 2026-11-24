import {test, expect, vi} from 'vitest'
import * as pipelean from '$src/index'
import {
  collect, enrich, failFast, failLate, filter, findSync, join, mapSeries,
  mapSeriesSync, reduce, rethrow, scan, series, seriesSync, skip,
} from '$src/index'

const STRATEGIES = [collect, failFast, failLate, skip, rethrow]

test('accepts every strategy object on series', async () => {
  const results = await Promise.all(STRATEGIES.map(strategy =>
    series([1, 2], item => item * 2, {strategy})))

  for (const result of results)
    expect(result.results).toEqual([2, 4])
})

test('accepts every strategy object on filter', async () => {
  const results = await Promise.all(STRATEGIES.map(strategy =>
    filter([1, 2], item => item === 2, {strategy})))

  for (const result of results)
    expect(result.results).toEqual([2])
})

test('accepts every strategy object on folds', async () => {
  const runs = STRATEGIES.map(strategy => Promise.all([
    scan([1, 2], (acc, item) => acc + item, 0, {strategy}),
    reduce([1, 2], (acc, item) => acc + item, 0, {strategy}),
  ]))

  for (const [scanned, reduced] of await Promise.all(runs)) {
    expect(scanned.results).toEqual([1, 3])
    expect(reduced.value).toBe(3)
  }
})

test('accepts every strategy object on enrich', async () => {
  const results = await Promise.all(STRATEGIES.map(strategy =>
    enrich([], {strategy})({})))

  for (const result of results)
    expect(result.value).toEqual({})
})

test('accepts every strategy object on join', async () => {
  const results = await Promise.all(STRATEGIES.map(strategy =>
    join({a: () => 1}, {strategy})))

  for (const result of results)
    expect(result.value).toEqual({a: 1})
})

test('accepts every strategy object on findSync', () => {
  for (const strategy of STRATEGIES) {
    const result = findSync([1, 2], item => item === 2, {strategy})

    expect(result.value).toBe(2)
  }
})

test('accepts strategy strings', async () => {
  const results = await Promise.all(
    ['collect', 'failFast', 'failLate', 'skip', 'throw'].map(strategy =>
      series([1], item => item, {strategy})),
  )

  for (const result of results)
    expect(result.results).toEqual([1])
})

test('rethrow string behaves like throw', async () => {
  const error = new Error('boom')

  await expect(
    series([1, 2], () => {
      throw error
    }, {strategy: 'rethrow'}),
  ).rejects.toBe(error)
})

test('rethrow object name behaves like throw', async () => {
  const error = new Error('boom')

  await expect(
    series([1, 2], () => {
      throw error
    }, {strategy: {name: 'rethrow'}}),
  ).rejects.toBe(error)
})

test.each(['fail', 'stopOnError'])(
  'rejects the removed alias %s',
  async alias => {
    expect(
      () => series([1], item => item, {strategy: alias}),
    ).toThrow(
      new TypeError(
        `series() strategy "${alias}" was removed in 0.18; use failFast`,
      ),
    )

    await expect(
      join({a: () => 1}, {strategy: alias}),
    ).rejects.toThrow(`join() strategy "${alias}" was removed in 0.18`)
  },
)

test('rejects removed aliases on the sync api', () => {
  expect(
    () => seriesSync([1], item => item, {strategy: 'stopOnError'}),
  ).toThrow(/seriesSync\(\) strategy "stopOnError" was removed in 0\.18/)
})

test.each(['failfast', null, 42, {}])(
  'rejects the unknown strategy %s',
  strategy => {
    expect(
      () => series([1], item => item, {strategy}),
    ).toThrow(/unknown strategy/)
  },
)

test('rejects an unknown strategy on findSync', () => {
  expect(
    () => findSync([1], item => item, {strategy: {}}),
  ).toThrow(/findSync\(\) unknown strategy/)
})

test('rejects an unknown strategy on a fold', () => {
  expect(
    () => scan([1], (acc, item) => acc + item, 0, {strategy: 'nope'}),
  ).toThrow(/scan\/reduce\(\) unknown strategy/)
})

test('rejects before pulling the source', () => {
  const pull = vi.fn()
  async function * source () {
    pull()
    yield 1
  }

  expect(
    () => series(source(), item => item, {strategy: 'nope'}),
  ).toThrow(TypeError)

  expect(pull).not.toHaveBeenCalled()
})

test('mapSeries accepts rethrow and throw', async () => {
  await expect(
    mapSeries([1, 2], item => item * 2, {strategy: rethrow}),
  ).resolves.toEqual([2, 4])
  await expect(
    mapSeries([1, 2], item => item * 2, {strategy: 'rethrow'}),
  ).resolves.toEqual([2, 4])
})

test('mapSeries rejects every other strategy; it always rethrows', () => {
  for (const strategy of [collect, failFast, failLate, skip]) {
    expect(
      () => mapSeries([1], item => item, {strategy}),
    ).toThrow(/mapSeries\(\) always rethrows on the first error/)
  }
})

test('mapSeriesSync rejects every other strategy; it always rethrows', () => {
  for (const strategy of [collect, failFast, failLate, skip]) {
    expect(
      () => mapSeriesSync([1], item => item, {strategy}),
    ).toThrow(/mapSeriesSync\(\) always rethrows on the first error/)
  }
})

test('mapSeries rejects a removed alias with the shared message', () => {
  expect(
    () => mapSeries([1], item => item, {strategy: 'fail'}),
  ).toThrow(/mapSeries\(\) strategy "fail" was removed in 0\.18/)
})

test('mapSeriesSync accepts rethrow', () => {
  expect(
    mapSeriesSync([1, 2], item => item * 2, {strategy: 'rethrow'}),
  ).toEqual([2, 4])
})

test('the public namespace has no fail or stopOnError', () => {
  expect('fail' in pipelean).toBe(false)
  expect('stopOnError' in pipelean).toBe(false)
})
