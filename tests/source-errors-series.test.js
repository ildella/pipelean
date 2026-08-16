import {
  series,
  failFast, collect, failLate, skip, rethrow,
} from '../src/functional.js'
import {
  fragileGenerator,
  createTrackedGenerator,
  fragileGeneratorImmediate,
  fragileGeneratorLate,
} from './source-errors-helpers'

test.fails('collect strategy: captures sourceError separately from operation errors', async () => {
  const {
    results, errors, sourceErrors, failure,
  } = await series(
    fragileGenerator(),
    item => item.data.toUpperCase(),
    {strategy: collect}
  )

  expect(results).toEqual(['A', 'B'])
  expect(errors).toEqual([]) // fn() never threw
  expect(sourceErrors).toHaveLength(1)
  expect(sourceErrors[0].error.message).toBe('DB connection lost at index 2')
  expect(sourceErrors[0].index).toBe(2)
  expect(sourceErrors[0].item).toBeUndefined() // source errors have no item
  expect(failure).toBe(false)
})

test.fails('failFast strategy: stops immediately on source error, returns empty results', async () => {
  const {
    results, errors, sourceErrors, failure,
  } = await series(
    fragileGenerator(),
    item => item.data.toUpperCase(),
    {strategy: failFast}
  )

  expect(results).toEqual([]) // failFast clears results
  expect(errors).toEqual([])
  expect(sourceErrors).toHaveLength(1)
  expect(failure.error.message).toBe('DB connection lost at index 2')
  expect(failure.index).toBe(2)
})

test.fails('failLate strategy: collects sourceError into failure at the end', async () => {
  const {
    results, errors, sourceErrors, failure,
  } = await series(
    fragileGenerator(),
    item => item.data.toUpperCase(),
    {strategy: failLate}
  )

  expect(results).toEqual(['A', 'B'])
  expect(errors).toEqual([])
  expect(sourceErrors).toHaveLength(1)
  expect(failure).toEqual({errors: sourceErrors})
})

test.fails('skip strategy: ignores source error, continues with what it has', async () => {
  const {
    results, errors, sourceErrors, failure,
  } = await series(
    fragileGenerator(),
    item => item.data.toUpperCase(),
    {strategy: skip}
  )

  expect(results).toEqual(['A', 'B'])
  expect(errors).toEqual([])
  expect(sourceErrors).toEqual([]) // skip does not collect
  expect(failure).toBe(false)
})

test('rethrow strategy: throws the source error immediately', async () => {
  await expect(
    series(fragileGenerator(), item => item.data, {strategy: rethrow})
  ).rejects.toThrow('DB connection lost at index 2')
})

test.fails('distinguishes operation errors from source errors', async () => {
  async function * gen () {
    yield {id: 1, fail: false}
    yield {id: 2, fail: true} // this item will cause fn() to throw
    yield {id: 3, fail: false}
    throw new Error('source error at index 3')
    // yield {id: 4, fail: false}
  }

  const {
    results, errors, sourceErrors, failure,
  } = await series(
    gen(),
    item => {
      if (item.fail)
        throw new Error(`Operation failed for item ${item.id}`)
      return item.id * 10
    },
    {strategy: collect}
  )

  expect(results).toEqual([10, 30]) // item 2 dropped (op error), item 4 never reached
  expect(errors).toHaveLength(1)
  expect(errors[0].item).toEqual({id: 2, fail: true})
  expect(errors[0].error.message).toBe('Operation failed for item 2')
  expect(errors[0].index).toBe(1)

  expect(sourceErrors).toHaveLength(1)
  expect(sourceErrors[0].error.message).toBe('source error at index 3')
  expect(sourceErrors[0].index).toBe(3)
  expect(sourceErrors[0].item).toBeUndefined()

  expect(failure).toBe(false)
})

test.fails('calls onSourceError callback for telemetry (does not affect control flow)', async () => {
  const onSourceError = vi.fn()
  const onError = vi.fn()

  await series(
    fragileGenerator(),
    item => item.data,
    {
      strategy: collect,
      onError,
      onSourceError,
    }
  )

  expect(onSourceError).toHaveBeenCalledTimes(1)
  expect(onSourceError).toHaveBeenCalledWith({
    error: expect.objectContaining({message: 'DB connection lost at index 2'}),
    index: 2,
  })
  expect(onError).not.toHaveBeenCalled() // fn() never threw
})

test.fails('calls onFailure with sourceError context under failFast', async () => {
  const onFailure = vi.fn()

  await series(
    fragileGenerator(),
    item => item.data,
    {strategy: failFast, onFailure}
  )

  expect(onFailure).toHaveBeenCalledTimes(1)
  expect(onFailure).toHaveBeenCalledWith(
    expect.objectContaining({
      error: expect.objectContaining({message: 'DB connection lost at index 2'}),
      index: 2,
    })
  )
})

test.fails('calls onFailure with aggregated errors under failLate (including sourceErrors)', async () => {
  const onFailure = vi.fn()

  await series(
    fragileGenerator(),
    item => item.data,
    {strategy: failLate, onFailure}
  )

  expect(onFailure).toHaveBeenCalledTimes(1)
  expect(onFailure).toHaveBeenCalledWith({
    errors: expect.arrayContaining([
      expect.objectContaining({error: expect.any(Error), index: 2}),
    ]),
  })
})

test.fails('triggers iterator.return() on early exit (failFast) to prevent resource leaks', async () => {
  const {gen, cleanedUp} = createTrackedGenerator()

  await series(
    gen(),
    item => item.id,
    {strategy: failFast}
  )

  expect(cleanedUp).toBe(true)
})

test.fails('triggers iterator.return() when take limit is reached before generator throws', async () => {
  const {gen, cleanedUp} = createTrackedGenerator()

  await series(
    gen(),
    item => item.id,
    {take: 1}
  )

  expect(cleanedUp).toBe(true)
})

test.fails('handles source error before any yields (immediate failure)', async () => {
  const {
    results, errors, sourceErrors, failure,
  } = await series(
    fragileGeneratorImmediate(),
    item => item.data,
    {strategy: collect}
  )

  expect(results).toEqual([])
  expect(errors).toEqual([])
  expect(sourceErrors).toHaveLength(1)
  expect(sourceErrors[0].index).toBe(0)
  expect(failure).toBe(false)
})

test.fails('handles source error after all items yielded (late failure)', async () => {
  const {
    results, errors, sourceErrors, failure,
  } = await series(
    fragileGeneratorLate(),
    item => item.data.toUpperCase(),
    {strategy: collect}
  )

  expect(results).toEqual(['A', 'B', 'C'])
  expect(sourceErrors).toHaveLength(1)
  expect(sourceErrors[0].index).toBe(3)
  expect(errors).toBe('???')
  expect(failure).toBe('???')
})
