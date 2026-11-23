import {test, expect} from 'vitest'
import {
  filterSync, findSync, mapSeriesSync, seriesSync,
} from '$src/index'

// Guard ownership: the sync policy inspects USER callback results only. A
// thenable ITEM travelling through an internal pass-through transform is data,
// not a violation (filterSync's transform returns the item unchanged).

const report = {
  errors: [], sourceErrors: [], failure: false,
}

test('filterSync keeps thenable items as data', () => {
  const first = Promise.resolve(1)
  const result = filterSync([first, 2], () => true)

  expect(result).toEqual({...report, results: [first, 2]})
  expect(result.results[0]).toBe(first)
})

test('filterSync keeps a custom thenable item as data', () => {
  const thenable = {then: () => undefined}

  expect(filterSync([thenable], () => true).results).toEqual([thenable])
})

test('filterSync drops a thenable item like any other value', () => {
  const result = filterSync([Promise.resolve(1), 2], x => x === 2)

  expect(result).toEqual({...report, results: [2]})
})

test('filterSync still rejects an async predicate, naming filter()', () => {
  expect(() => filterSync([1, 2], async x => await x > 1))
    .toThrow('filterSync() predicate returned a Promise; use filter()')
})

test('findSync matches a thenable item with a sync predicate', () => {
  const result = findSync([Promise.resolve(1), 2], x => x === 2)

  expect(result).toEqual({...report, result: 2})
})

test('findSync returns the thenable item unchanged when it matches', () => {
  const first = Promise.resolve(1)

  expect(findSync([first], () => true).result).toBe(first)
})

test('seriesSync still rejects a mapper that returns a promise', () => {
  expect(() => seriesSync([1], async x => await x))
    .toThrow('seriesSync() mapper returned a Promise; use series()')
})

test('mapSeriesSync still rejects a mapper that returns a promise', () => {
  expect(() => mapSeriesSync([1], async x => await x))
    .toThrow('mapSeriesSync() mapper returned a Promise; use mapSeries()')
})

// Detection is result-based, not item-based: the mapper RETURNS the thenable
// item, so the guard fires. Wrap it as data (`{promise}`) to carry it through.
test('seriesSync rejects a mapper that returns a thenable item', () => {
  expect(() => seriesSync([Promise.resolve(1)], x => x))
    .toThrow('seriesSync() mapper returned a Promise; use series()')
})

test('mapSeriesSync rejects a mapper that returns a thenable item', () => {
  expect(() => mapSeriesSync([Promise.resolve(1)], x => x))
    .toThrow('mapSeriesSync() mapper returned a Promise; use mapSeries()')
})

test('seriesSync carries a thenable item when the mapper wraps it', () => {
  const first = Promise.resolve(1)
  const {results} = seriesSync([first], promise => ({promise}))

  expect(results).toEqual([{promise: first}])
})
