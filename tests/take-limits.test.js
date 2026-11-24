import {test, expect, vi} from 'vitest'
import {
  filter, filterSync, findSync, mapSeries, mapSeriesSync, series, seriesSync,
} from '$src/index'

const countingSource = values => {
  const state = {pulled: 0, cleanedUp: false}
  const gen = async function * () {
    try {
      for (const value of values) {
        state.pulled++
        yield value
      }
    } finally {
      state.cleanedUp = true
    }
  }

  return {items: gen(), state}
}

const countingSourceSync = values => {
  const state = {pulled: 0, cleanedUp: false}
  const gen = function * () {
    try {
      for (const value of values) {
        state.pulled++
        yield value
      }
    } finally {
      state.cleanedUp = true
    }
  }

  return {items: gen(), state}
}

const empty = {
  results: [], errors: [], sourceErrors: [], failure: false,
}

const noMatch = {
  value: undefined, errors: [], sourceErrors: [], failure: false,
}

test('series with take: 0 pulls nothing from the source', async () => {
  const {items, state} = countingSource([1, 2, 3])
  const fn = vi.fn(x => x)
  const result = await series(items, fn, {take: 0})

  expect(result).toEqual(empty)
  expect(state.pulled).toBe(0)
  expect(fn).not.toHaveBeenCalled()
})

test('seriesSync with take: 0 pulls nothing from the source', () => {
  const {items, state} = countingSourceSync([1, 2, 3])
  const fn = vi.fn(x => x)
  const result = seriesSync(items, fn, {take: 0})

  expect(result).toEqual(empty)
  expect(state.pulled).toBe(0)
  expect(fn).not.toHaveBeenCalled()
})

test('filter with take: 0 pulls nothing from the source', async () => {
  const {items, state} = countingSource([1, 2, 3])
  const predicate = vi.fn(() => true)
  const result = await filter(items, predicate, {take: 0})

  expect(result).toEqual(empty)
  expect(state.pulled).toBe(0)
  expect(predicate).not.toHaveBeenCalled()
})

test('filterSync with take: 0 pulls nothing from the source', () => {
  const {items, state} = countingSourceSync([1, 2, 3])
  const predicate = vi.fn(() => true)
  const result = filterSync(items, predicate, {take: 0})

  expect(result).toEqual(empty)
  expect(state.pulled).toBe(0)
  expect(predicate).not.toHaveBeenCalled()
})

test('mapSeries with take: 0 pulls nothing from the source', async () => {
  const {items, state} = countingSource([1, 2, 3])

  await expect(mapSeries(items, x => x, {take: 0})).resolves.toEqual([])
  expect(state.pulled).toBe(0)
})

test('mapSeriesSync with take: 0 pulls nothing from the source', () => {
  const {items, state} = countingSourceSync([1, 2, 3])

  expect(mapSeriesSync(items, x => x, {take: 0})).toEqual([])
  expect(state.pulled).toBe(0)
})

test('findSync with take: 0 pulls nothing from the source', () => {
  const {items, state} = countingSourceSync([1, 2, 3])
  const predicate = vi.fn(() => true)
  const result = findSync(items, predicate, {take: 0})

  expect(result).toEqual(noMatch)
  expect(state.pulled).toBe(0)
  expect(predicate).not.toHaveBeenCalled()
})

test('take: 1 pulls one item and closes the source', async () => {
  const {items, state} = countingSource([1, 2, 3])
  const result = await series(items, x => x * 10, {take: 1})

  expect(result.results).toEqual([10])
  expect(state.pulled).toBe(1)
  expect(state.cleanedUp).toBe(true)
})

test('seriesSync take: 1 pulls one item and closes the source', () => {
  const {items, state} = countingSourceSync([1, 2, 3])
  const result = seriesSync(items, x => x * 10, {take: 1})

  expect(result.results).toEqual([10])
  expect(state.pulled).toBe(1)
  expect(state.cleanedUp).toBe(true)
})

test('findSync take: 1 pulls one item and closes the source', () => {
  const {items, state} = countingSourceSync([1, 2, 3])
  const result = findSync(items, () => false, {take: 1})

  expect(result).toEqual(noMatch)
  expect(state.pulled).toBe(1)
  expect(state.cleanedUp).toBe(true)
})

test('take: 0 never starts the source, even a broken one', async () => {
  const boom = new Error('never pulled')
  // eslint-disable-next-line require-yield
  const source = async function * () {
    throw boom
  }

  const result = await series(source(), x => x, {take: 0})

  expect(result).toEqual(empty)
})

const invalidTakes = [-1, 1.5, NaN, Infinity]

test.each(invalidTakes)('async take %s is rejected', take => {
  expect(() => series([1], x => x, {take})).toThrow(TypeError)
  expect(() => filter([1], () => true, {take})).toThrow(TypeError)
})

test.each(invalidTakes)('sync take %s is rejected', take => {
  expect(() => seriesSync([1], x => x, {take})).toThrow(TypeError)
  expect(() => filterSync([1], () => true, {take})).toThrow(TypeError)
  expect(() => findSync([1], () => false, {take})).toThrow(TypeError)
})

test.each(invalidTakes)('mapSeries take %s rejects', async take => {
  await expect(mapSeries([1], x => x, {take})).rejects.toThrow(TypeError)
})

test.each(invalidTakes)('mapSeriesSync take %s throws', take => {
  expect(() => mapSeriesSync([1], x => x, {take})).toThrow(TypeError)
})

test('take validation names the api', () => {
  const message = 'take must be a non-negative integer'

  expect(() => series([1], x => x, {take: -1}))
    .toThrow(`series() ${message}`)
  expect(() => seriesSync([1], x => x, {take: -1}))
    .toThrow(`seriesSync() ${message}`)
  expect(() => findSync([1], () => false, {take: -1}))
    .toThrow(`findSync() ${message}`)
})

const invalidTotals = [-1, NaN, Infinity, '3']

test.each(invalidTotals)('total %s is rejected', total => {
  expect(() => series([1], x => x, {total})).toThrow(TypeError)
  expect(() => seriesSync([1], x => x, {total})).toThrow(TypeError)
  expect(() => findSync([1], () => false, {total})).toThrow(TypeError)
})

test('total validation names the api', () => {
  expect(() => series([1], x => x, {total: -1}))
    .toThrow('series() total must be a finite non-negative number')
})

test('total: 0 is valid and reaches callbacks', async () => {
  const progress = []
  const result = await series([1, 2], x => x, {
    total: 0,
    onProgress: value => progress.push(value),
  })

  expect(result.results).toEqual([1, 2])
  expect(progress.map(value => value.total)).toEqual([0, 0])
})
