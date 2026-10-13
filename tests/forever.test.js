import {test, expect} from 'vitest'
import {
  filter, reduce, rethrow, series,
} from '$src/functional'
import {forever, stopWhen} from '$src/iterables'

const collectStopped = async predicate => {
  const items = []
  for await (const item of stopWhen(forever(), predicate))
    items.push(item)
  return items
}

// forever is unbounded: every consumption below is bounded by stopWhen, take,
// or a counter — a bare collect(forever()) would never end.

test('yields the natural numbers from zero', async () => {
  const items = await collectStopped((_, index) => index === 4)
  expect(items).toEqual([0, 1, 2, 3])
})

test('a fresh forever starts from zero again', async () => {
  await expect(collectStopped((_, i) => i === 2)).resolves.toEqual([0, 1])
  await expect(collectStopped((_, i) => i === 2)).resolves.toEqual([0, 1])
})

test('stopWhen bounds the run: the daemon composition', async () => {
  let aborted = false
  const items = []
  for await (const item of stopWhen(forever(), () => aborted)) {
    items.push(item)
    aborted = item === 2
  }
  expect(items).toEqual([0, 1, 2])
})

test('reduce over the daemon composition stops cleanly', async () => {
  let aborted = false
  const {
    value, errors, sourceErrors, failure,
  } = await reduce(
    stopWhen(forever(), () => aborted),
    (state, index) => {
      state.cycles += 1
      aborted = index === 4
      return state
    },
    {cycles: 0},
  )
  expect(value).toEqual({cycles: 5})
  expect(errors).toEqual([])
  expect(sourceErrors).toEqual([])
  expect(failure).toBe(false)
})

test('series over the daemon composition keeps results bounded', async () => {
  let aborted = false
  const result = await series(
    stopWhen(forever(), () => aborted),
    (_, index) => {
      aborted = index === 3
      return index * 10
    },
  )
  expect(result.results).toEqual([0, 10, 20, 30])
  expect(result.failure).toBe(false)
})

test('take bounds the source without a predicate', async () => {
  const result = await series(forever(), x => x, {take: 3})
  expect(result.results).toEqual([0, 1, 2])
})

test('filter inherits the daemon composition', async () => {
  const result = await filter(
    stopWhen(forever(), (_, index) => index === 4),
    x => x % 2 === 0,
  )
  expect(result.results).toEqual([0, 2])
})

test('rethrow propagates a scanner throw out of the loop', async () => {
  const bang = new Error('bang')
  let aborted = false
  await expect(reduce(
    stopWhen(forever(), () => aborted),
    state => {
      state.cycles += 1
      aborted = state.cycles === 2
      if (state.cycles === 2)
        throw bang
      return state
    },
    {cycles: 0},
    {strategy: rethrow},
  )).rejects.toBe(bang)
})

test('the predicate may close over an abort signal', async () => {
  const controller = new AbortController()
  let ticks = 0
  const items = []
  for await (const item of
    stopWhen(forever(), () => controller.signal.aborted)) {
    items.push(item)
    ticks += 1
    if (ticks === 3)
      controller.abort()
  }
  expect(items).toEqual([0, 1, 2])
})

test('stopping before the first tick yields nothing', async () => {
  await expect(collectStopped(() => true)).resolves.toEqual([])
})

test('onProgress fires per kept tick with no total', async () => {
  const progress = []
  let aborted = false
  await series(
    stopWhen(forever(), () => aborted),
    (_, index) => {
      progress.push(index)
      aborted = index === 1
      return index
    },
    {onProgress: value => progress.push(`p${value.index}`)},
  )
  expect(progress).toEqual([0, 'p0', 1, 'p1'])
  expect(Object.hasOwn(progress[1], 'total')).toBe(false)
})

test('raw for await over forever works but stays unbounded', async () => {
  const seen = []
  for await (const item of forever()) {
    seen.push(item)
    if (seen.length === 3)
      break
  }
  expect(seen).toEqual([0, 1, 2])
})
