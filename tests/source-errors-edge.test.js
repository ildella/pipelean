import {
  series, scan, filter, reduce, failFast, collect, failLate, skip, rethrow,
} from '../src/functional.js'
import {fragileGenerator} from './source-errors-helpers'

test.fails('handles infinite generator with take + source error beyond take', async () => {
  async function * infinite () {
    let i = 0
    try {
      while (true) {
        yield i++
      }
    } finally {
      // cleanup
    }
  }

  const {results, sourceErrors} = await series(
    infinite(),
    x => x * 2,
    {take: 3, strategy: collect}
  )

  expect(results).toEqual([0, 2, 4])
  expect(sourceErrors).toEqual([]) // never reached the error
})

test.fails('handles generator that throws during cleanup (iterator.return() itself throws)', async () => {
  async function * badCleanup () {
    try {
      yield 1
      yield 2
      throw new Error('source error')
    } finally {
      throw new Error('cleanup error') // finally block throws!
    }
  }

  // The source error should still be captured; cleanup error is a secondary concern
  const {results, sourceErrors} = await series(
    badCleanup(),
    x => x,
    {strategy: collect}
  )

  expect(results).toEqual([1, 2])
  expect(sourceErrors).toHaveLength(1)
  // Implementation note: if iterator.return() throws, that error might need
  // to be suppressed or reported separately. This test documents the behavior.
})

test('onSourceError is NOT called for rethrow strategy (same contract as onError)', async () => {
  const onSourceError = vi.fn()

  await expect(
    series(fragileGenerator(), x => x, {
      strategy: rethrow,
      onSourceError,
    })
  ).rejects.toThrow()

  expect(onSourceError).not.toHaveBeenCalled()
})

test.fails('source error index is the iteration index, not the yielded count', async () => {
  async function * gen () {
    yield 'a' // index 0
    yield 'b' // index 1
    throw new Error('bang') // index 2 (the next() call that failed)
  }

  const {sourceErrors} = await series(gen(), x => x, {strategy: collect})
  expect(sourceErrors[0].index).toBe(2)
})
