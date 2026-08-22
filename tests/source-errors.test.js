/* eslint-disable max-lines */
/* eslint-disable require-await, @stylistic/max-len, require-yield */
import {test, expect, vi} from 'vitest'
import {
  collect,
  failFast,
  failLate,
  skip,
  rethrow,
  series,
  scan,
  reduce,
  filter,
} from '$src/functional'
import {
  fragileSource,
  trackedSource,
  badCleanupSource,
} from './source-errors-helpers'

test('collect: source death preserves results and records sourceErrors', async () => {
  const boom = new Error('db connection lost')
  const items = fragileSource([1, 2], boom)

  const result = await series(items, async x => x * 10, {strategy: collect})

  expect(result.results).toEqual([10, 20])
  expect(result.errors).toEqual([])
  expect(result.sourceErrors).toEqual([{error: boom, index: 2}])
  expect(result.failure).toBe(false)
})

test('failFast: failure is the source context and results are cleared', async () => {
  const boom = new Error('stream died')
  const items = fragileSource([1, 2], boom)

  const result = await series(items, async x => x * 10, {strategy: failFast})

  expect(result.results).toEqual([])
  expect(result.sourceErrors).toEqual([{error: boom, index: 2}])
  expect(result.failure).toEqual({error: boom, index: 2})
})

test('failLate: source context merges into end-of-run failure', async () => {
  const opError = new Error('op failed')
  const srcError = new Error('source died')

  const gen = async function * () {
    yield 1
    yield 2
    throw srcError
  }
  const fn = async x => {
    if (x === 1)
      throw opError
    return x
  }

  const result = await series(gen(), fn, {strategy: failLate})

  expect(result.errors).toHaveLength(1)
  expect(result.errors[0].error).toBe(opError)
  expect(result.sourceErrors).toEqual([{error: srcError, index: 2}])
  expect(result.failure).toEqual({
    errors: [...result.errors, ...result.sourceErrors],
  })
})

test('skip: source errors are ignored entirely', async () => {
  const boom = new Error('gone')
  const items = fragileSource([1, 2], boom)

  const result = await series(items, async x => x * 10, {strategy: skip})

  expect(result.results).toEqual([10, 20])
  expect(result.errors).toEqual([])
  expect(result.sourceErrors).toEqual([])
  expect(result.failure).toBe(false)
})

test('rethrow: source error propagates and onSourceError is not called', async () => {
  const boom = new Error('raw throw')
  const onSourceError = vi.fn()
  const items = fragileSource([1], boom)

  await expect(
    series(items, async x => x, {strategy: rethrow, onSourceError}),
  ).rejects.toBe(boom)
  expect(onSourceError).not.toHaveBeenCalled()
})

test('onSourceError is called once with the context under collect', async () => {
  const boom = new Error('telemetry check')
  const onError = vi.fn()
  const onSourceError = vi.fn()
  const items = fragileSource([1, 2], boom)

  const result = await series(items, async x => x, {
    strategy: collect,
    onError,
    onSourceError,
  })

  expect(onSourceError).toHaveBeenCalledTimes(1)
  expect(onSourceError).toHaveBeenCalledWith({error: boom, index: 2})
  expect(onError).not.toHaveBeenCalled()
  expect(result.sourceErrors).toEqual([{error: boom, index: 2}])
})

test('onFailure receives the source context under failFast', async () => {
  const boom = new Error('failed fast')
  const onFailure = vi.fn()
  const items = fragileSource(['a'], boom)

  await series(items, async x => x, {strategy: failFast, onFailure})

  expect(onFailure).toHaveBeenCalledTimes(1)
  expect(onFailure).toHaveBeenCalledWith({error: boom, index: 1})
})

test('reduce: value carries the last accumulator before death', async () => {
  const boom = new Error('reducer stream lost')

  const gen = async function * () {
    yield 1
    yield 2
    throw boom
  }

  const collected = await reduce(gen(), async (acc, x) => acc + x, 0, {
    strategy: collect,
  })
  expect(collected.value).toBe(3)
  expect(collected.errors).toEqual([])
  expect(collected.sourceErrors).toEqual([{error: boom, index: 2}])
  expect(collected.failure).toBe(false)
})

test('reduce failFast: value preserved, failure is the source context', async () => {
  const boom = new Error('stop now')

  const gen = async function * () {
    yield 1
    yield 2
    throw boom
  }

  const result = await reduce(gen(), async (acc, x) => acc + x, 0, {
    strategy: failFast,
  })

  expect(result.value).toBe(3)
  expect(result.sourceErrors).toEqual([{error: boom, index: 2}])
  expect(result.failure).toEqual({error: boom, index: 2})
})

test('scan mode: partial results preserved per strategy', async () => {
  const boom = new Error('scan dies')

  const gen = async function * () {
    yield 1
    yield 2
    throw boom
  }

  const collectedResult = await scan(gen(), async (acc, x) => acc + x, 0, {
    strategy: collect,
  })
  expect(collectedResult.results).toEqual([1, 3])
  expect(collectedResult.sourceErrors).toEqual([{error: boom, index: 2}])

  const skipResult = await scan(fragileSource([1, 2], boom), async (acc, x) => acc + x, 0, {
    strategy: skip,
  })
  expect(skipResult.results).toEqual([1, 3])
  expect(skipResult.sourceErrors).toEqual([])
  expect(skipResult.failure).toBe(false)
})

test('filter: filtered results preserved and sourceErrors captured', async () => {
  const boom = new Error('filtered stream broke')
  const items = fragileSource([1, 2, 3, 4], boom)
  const keepEvens = filter(async x => x % 2 === 0, {strategy: collect})

  const result = await keepEvens(items)

  expect(result.results).toEqual([2, 4])
  expect(result.sourceErrors).toEqual([{error: boom, index: 4}])
  expect(result.failure).toBe(false)
})

test('immediate failure: source throwing before first yield has index 0', async () => {
  const boom = new Error('never yielded')

  const gen = async function * () {
    throw boom
  }

  const result = await series(gen(), async x => x, {strategy: collect})

  expect(result.results).toEqual([])
  expect(result.sourceErrors).toEqual([{error: boom, index: 0}])
})

test('late failure: throw after the last item processed', async () => {
  const boom = new Error('one too many')

  const gen = async function * () {
    yield 1
    throw boom
  }

  const result = await series(gen(), async x => x * 2, {strategy: collect})

  expect(result.results).toEqual([2])
  expect(result.sourceErrors).toEqual([{error: boom, index: 1}])
})

test('take reached before the throw: no source errors and generator closed', async () => {
  const boom = new Error('never reached')
  const {gen, state} = trackedSource([1, 2, 3])

  const result = await series(gen(), async x => x * 10, {take: 2})

  expect(result.results).toEqual([10, 20])
  expect(result.sourceErrors).toEqual([])
  expect(result.failure).toBe(false)
  expect(state.cleanedUp).toBe(true)

  const dyingSource = fragileSource([1, 2], boom)
  const fn = vi.fn(async x => x)
  await series(dyingSource, fn, {take: 2})
  expect(fn).toHaveBeenCalledTimes(2)
})

test('generator finally runs when the source dies mid-stream', async () => {
  const boom = new Error('mid-stream death')
  let cleanupRan = false

  const gen = async function * () {
    try {
      yield 1
      yield 2
      throw boom
    } finally {
      cleanupRan = true
    }
  }

  const result = await series(gen(), async x => x, {strategy: collect})

  expect(result.results).toEqual([1, 2])
  expect(cleanupRan).toBe(true)
  expect(result.sourceErrors[0].error).toBe(boom)
})

test('bad cleanup: finally throwing supersedes the source error', async () => {
  const original = new Error('original death')
  const cleanup = new Error('cleanup exploded')
  const items = badCleanupSource([1, 2], original, cleanup)

  const result = await series(items, async x => x * 10, {strategy: collect})

  expect(result.results).toEqual([10, 20])
  expect(result.sourceErrors).toHaveLength(1)
  expect(result.sourceErrors[0].index).toBe(2)
  expect(result.sourceErrors[0].error).toBe(cleanup)
  expect(result.sourceErrors[0].error).not.toBe(original)
})
