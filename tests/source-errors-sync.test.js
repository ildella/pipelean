/* eslint-disable max-lines */
/* eslint-disable @stylistic/max-len, require-yield */
import {test, expect, vi} from 'vitest'
import {
  collect,
  failFast,
  failLate,
  skip,
  rethrow,
  seriesSync,
  scanSync,
  reduceSync,
  filterSync,
} from '$src/index'

const fragileSource = (values, error) => (function * () {
  for (const value of values)
    yield value
  throw error
})()

test('collect: source death preserves results and records sourceErrors', () => {
  const boom = new Error('sync source died')
  const items = fragileSource([1, 2], boom)

  const result = seriesSync(items, x => x * 10, {strategy: collect})

  expect(result.results).toEqual([10, 20])
  expect(result.errors).toEqual([])
  expect(result.sourceErrors).toEqual([{error: boom, index: 2}])
  expect(result.failure).toBe(false)
})

test('failFast: failure is the source context and results are cleared', () => {
  const boom = new Error('stop the line')
  const items = fragileSource([1, 2], boom)

  const result = seriesSync(items, x => x * 10, {strategy: failFast})

  expect(result.results).toEqual([])
  expect(result.sourceErrors).toEqual([{error: boom, index: 2}])
  expect(result.failure).toEqual({error: boom, index: 2})
})

test('failLate: source context merges into end-of-run failure with op errors', () => {
  const opError = new Error('op failed')
  const srcError = new Error('source died')

  const gen = function * () {
    yield 1
    yield 2
    throw srcError
  }
  const fn = x => {
    if (x === 1)
      throw opError
    return x
  }

  const result = seriesSync(gen(), fn, {strategy: failLate})

  expect(result.errors).toHaveLength(1)
  expect(result.errors[0].error).toBe(opError)
  expect(result.sourceErrors).toEqual([{error: srcError, index: 2}])
  expect(result.failure).toEqual({
    errors: [...result.errors, ...result.sourceErrors],
  })
})

test('skip: source errors are ignored entirely', () => {
  const boom = new Error('skipped death')
  const items = fragileSource([1, 2], boom)

  const result = seriesSync(items, x => x * 10, {strategy: skip})

  expect(result.results).toEqual([10, 20])
  expect(result.errors).toEqual([])
  expect(result.sourceErrors).toEqual([])
  expect(result.failure).toBe(false)
})

test('rethrow: source error propagates and onSourceError is not called', () => {
  const boom = new Error('raw sync throw')
  const onSourceError = vi.fn()
  const items = fragileSource([1], boom)

  expect(() =>
    seriesSync(items, x => x, {strategy: rethrow, onSourceError})).toThrow(boom)
  expect(onSourceError).not.toHaveBeenCalled()
})

test('onSourceError is called once and onError never, under collect', () => {
  const boom = new Error('telemetry')
  const onError = vi.fn()
  const onSourceError = vi.fn()
  const items = fragileSource(['a', 'b'], boom)

  const result = seriesSync(items, x => x, {
    strategy: collect,
    onError,
    onSourceError,
  })

  expect(onSourceError).toHaveBeenCalledTimes(1)
  expect(onSourceError).toHaveBeenCalledWith({error: boom, index: 2})
  expect(onError).not.toHaveBeenCalled()
  expect(result.sourceErrors).toEqual([{error: boom, index: 2}])
})

test('onFailure receives the source context under failFast', () => {
  const boom = new Error('failed fast sync')
  const onFailure = vi.fn()
  const items = fragileSource(['only'], boom)

  seriesSync(items, x => x, {strategy: failFast, onFailure})

  expect(onFailure).toHaveBeenCalledTimes(1)
  expect(onFailure).toHaveBeenCalledWith({error: boom, index: 1})
})

test('reduceSync: value carries the last accumulator before death', () => {
  const boom = new Error('reducer lost')

  const gen = function * () {
    yield 1
    yield 2
    yield 3
    throw boom
  }

  const collected = reduceSync(gen(), (acc, x) => acc + x, 0, {
    strategy: collect,
  })
  expect(collected.value).toBe(6)
  expect(collected.sourceErrors).toEqual([{error: boom, index: 3}])
  expect(collected.failure).toBe(false)

  const stopped = reduceSync(fragileSource([1, 2], boom), (acc, x) => acc + x, 0, {
    strategy: failFast,
  })
  expect(stopped.value).toBe(3)
  expect(stopped.failure).toEqual({error: boom, index: 2})
})

test('scanSync mode: partial results preserved per strategy', () => {
  const boom = new Error('scan lost')

  const gen = function * () {
    yield 1
    yield 2
    throw boom
  }

  const collectedResult = scanSync(gen(), (acc, x) => acc + x, 0, {
    strategy: collect,
  })
  expect(collectedResult.results).toEqual([1, 3])
  expect(collectedResult.sourceErrors).toEqual([{error: boom, index: 2}])

  const skipResult = scanSync(fragileSource([1, 2], boom), (acc, x) => acc + x, 0, {
    strategy: skip,
  })
  expect(skipResult.results).toEqual([1, 3])
  expect(skipResult.sourceErrors).toEqual([])
  expect(skipResult.failure).toBe(false)
})

test('filterSync: filtered results preserved and sourceErrors captured', () => {
  const boom = new Error('filter stream broke')
  const items = fragileSource([1, 2, 3, 4], boom)
  const keepEvens = filterSync(x => x % 2 === 0, {strategy: collect})

  const result = keepEvens(items)

  expect(result.results).toEqual([2, 4])
  expect(result.sourceErrors).toEqual([{error: boom, index: 4}])
  expect(result.failure).toBe(false)
})

test('immediate failure: source throwing before first yield has index 0', () => {
  const boom = new Error('never yielded sync')

  const gen = function * () {
    throw boom
  }

  const result = seriesSync(gen(), x => x, {strategy: collect})

  expect(result.results).toEqual([])
  expect(result.sourceErrors).toEqual([{error: boom, index: 0}])
})

test('late failure: throw after the last item processed', () => {
  const boom = new Error('one too many sync')

  const gen = function * () {
    yield 1
    throw boom
  }

  const result = seriesSync(gen(), x => x * 2, {strategy: collect})

  expect(result.results).toEqual([2])
  expect(result.sourceErrors).toEqual([{error: boom, index: 1}])
})

test('take reached before the throw: no source errors and iterator.return called', () => {
  const boom = new Error('never reached')
  let returned = false

  const gen = function * () {
    try {
      yield 1
      yield 2
      yield 3
      throw boom
    } finally {
      returned = true
    }
  }

  const fn = vi.fn(x => x * 10)
  const result = seriesSync(gen(), fn, {take: 2})

  expect(result.results).toEqual([10, 20])
  expect(fn).toHaveBeenCalledTimes(2)
  expect(result.sourceErrors).toEqual([])
  expect(returned).toBe(true)
})

test('generator finally runs when the source dies mid-stream', () => {
  const boom = new Error('mid-stream sync death')
  let cleanupRan = false

  const gen = function * () {
    try {
      yield 1
      yield 2
      throw boom
    } finally {
      cleanupRan = true
    }
  }

  const result = seriesSync(gen(), x => x, {strategy: collect})

  expect(result.results).toEqual([1, 2])
  expect(cleanupRan).toBe(true)
  expect(result.sourceErrors[0].error).toBe(boom)
})

test('bad cleanup: finally throwing supersedes the source error', () => {
  const original = new Error('original sync death')
  const cleanup = new Error('cleanup exploded sync')

  const gen = function * () {
    try {
      yield 1
      yield 2
      throw original
    } finally {
      // eslint-disable-next-line no-unsafe-finally
      throw cleanup
    }
  }

  const result = seriesSync(gen(), x => x * 10, {strategy: collect})

  expect(result.results).toEqual([10, 20])
  expect(result.sourceErrors).toHaveLength(1)
  expect(result.sourceErrors[0].index).toBe(2)
  expect(result.sourceErrors[0].error).toBe(cleanup)
})
