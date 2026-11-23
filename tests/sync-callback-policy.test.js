import {test, expect} from 'vitest'
import {
  collect, enrichSync, filterSync, findSync, foldSync, mapSeriesSync,
  pipeSync, reduceSync, rethrow, scanSync, seriesSync, tryCatchSync,
} from '$src/index'
import {assertSyncResult, isThenable} from '$src/shared.js'

test('seriesSync rejects an async mapper, even under collect', () => {
  expect(() => seriesSync([1, 2], async x => await x, {strategy: collect}))
    .toThrow('seriesSync() mapper returned a Promise; use series()')
})

test('mapSeriesSync rejects an async mapper, pointing at mapSeries', () => {
  expect(() => mapSeriesSync([1, 2], async x => await x))
    .toThrow('mapSeriesSync() mapper returned a Promise; use mapSeries()')
})

test('filterSync rejects an async predicate', () => {
  expect(() => filterSync([1, 2, 3], async x => await x > 1))
    .toThrow('filterSync() predicate returned a Promise; use filter()')
})

test('findSync rejects an async predicate', () => {
  expect(() => findSync([1, 2, 3], async x => await x > 1))
    .toThrow('findSync() predicate returned a Promise; use filter()')
})

test('scanSync rejects an async scanner', () => {
  expect(() => scanSync([1, 2], async (acc, x) => await acc + x, 0))
    .toThrow('scanSync() scanner returned a Promise; use scan()')
})

test('reduceSync rejects an async scanner', () => {
  expect(() => reduceSync([1, 2], async (acc, x) => await acc + x, 0))
    .toThrow('reduceSync() scanner returned a Promise; use reduce()')
})

test('reduceSync rejects an async scanner even with recover', () => {
  expect(() => reduceSync([1, 2], async (acc, x) => await acc + x, 0, {
    recover: ({state}) => state,
  })).toThrow('reduceSync() scanner returned a Promise; use reduce()')
})

test('foldSync rejects an async reducer', () => {
  expect(() => foldSync([1, 2], async (acc, x) => await acc + x, 0))
    .toThrow('foldSync() reducer returned a Promise; use reduce()')
})

test('enrichSync rejects an async operation, even under collect', () => {
  const run = enrichSync([async state => await state], {strategy: collect})

  expect(() => run({}))
    .toThrow('enrichSync() operation returned a Promise; use enrich()')
})

test('pipeSync rejects an async step', () => {
  expect(() => pipeSync(async x => await x + 1, x => x * 2)(1))
    .toThrow('pipeSync() step returned a Promise; use pipe()')
})

test('tryCatchSync rejects an async fn', () => {
  expect(() => tryCatchSync(async () => await 1)())
    .toThrow('tryCatchSync() fn returned a Promise; use tryCatch()')
})

test('tryCatchSync rejects async lifecycle callbacks', () => {
  const asyncNoop = async () => await undefined

  expect(() => tryCatchSync(() => 1, {onStart: asyncNoop})())
    .toThrow('tryCatchSync() onStart returned a Promise; use tryCatch()')
  expect(() => tryCatchSync(() => 1, {onSuccess: asyncNoop})())
    .toThrow('tryCatchSync() onSuccess returned a Promise; use tryCatch()')
  expect(() => tryCatchSync(() => 1, {onFinally: asyncNoop})())
    .toThrow('tryCatchSync() onFinally returned a Promise; use tryCatch()')
})

test('tryCatchSync rejects an async onError', () => {
  const wrapped = tryCatchSync(() => {
    throw new Error('boom')
  }, {onError: async () => await undefined})

  expect(() => wrapped())
    .toThrow('tryCatchSync() onError returned a Promise; use tryCatch()')
})

test('a custom thenable is rejected like a native Promise', () => {
  const thenable = {then: () => undefined}

  expect(() => seriesSync([1], () => thenable))
    .toThrow('seriesSync() mapper returned a Promise; use series()')
})

test('the rejection is a TypeError that escapes the strategy', () => {
  let thrown
  try {
    seriesSync([1], async x => await x, {strategy: rethrow})
  } catch (error) {
    thrown = error
  }

  expect(thrown).toBeInstanceOf(TypeError)
})

test('a synchronous mapper throw is still collected as data', () => {
  const {results, errors} = seriesSync([1, 2], x => {
    if (x === 2)
      throw new Error('boom')
    return x
  }, {strategy: collect})

  expect(results).toEqual([1])
  expect(errors).toHaveLength(1)
})

test('undefined still drops and falsy values still flow', () => {
  const {results} = seriesSync([0, '', false, null, 1], x =>
    x === 1 ? undefined : x)

  expect(results).toEqual([0, '', false, null])
})

test('foldSync keeps an undefined accumulator', () => {
  expect(foldSync([1, 2], () => undefined, 0)).toBeUndefined()
})

test('assertSyncResult passes non-thenables and rejects thenables', () => {
  for (const value of [undefined, null, 0, '', false, {}, [], () => undefined])
    expect(() => assertSyncResult(value, 'api() cb', 'twin')).not.toThrow()

  expect(() => assertSyncResult(Promise.resolve(1), 'api() cb', 'twin'))
    .toThrow('api() cb returned a Promise; use twin()')
  expect(() => assertSyncResult({then: () => undefined}, 'api() cb', 'twin'))
    .toThrow(TypeError)
})

test('isThenable recognizes promises and custom thenables only', () => {
  expect(isThenable(Promise.resolve(1))).toBe(true)
  expect(isThenable({then: () => undefined})).toBe(true)
  expect(isThenable(null)).toBe(false)
  expect(isThenable(undefined)).toBe(false)
  expect(isThenable(42)).toBe(false)
  expect(isThenable({})).toBe(false)
})
