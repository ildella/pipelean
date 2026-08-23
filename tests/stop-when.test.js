import {test, expect, vi} from 'vitest'
import {filter, reduce, series} from '$src/functional'
import {stopWhen} from '$src/iterables'
import {trackedSource} from './source-errors-helpers.js'

const collect = async iterable => {
  const items = []
  for await (const item of iterable)
    items.push(item)
  return items
}

// Adapter contract — ported from nucube-app stop-when.test.js

test('yields items until the predicate fires', async () => {
  const items = await collect(stopWhen([1, 2, 3, 4], n => n === 3))
  expect(items).toEqual([1, 2])
})

test('yields everything when the predicate never fires', async () => {
  const items = await collect(stopWhen([1, 2], () => false))
  expect(items).toEqual([1, 2])
})

test('yields nothing when the predicate fires immediately', async () => {
  const items = await collect(stopWhen([1, 2], () => true))
  expect(items).toEqual([])
})

test('passes each examined item to the predicate', async () => {
  const seen = []
  await collect(stopWhen([1, 2, 3], item => {
    seen.push(item)
    return false
  }))
  expect(seen).toEqual([1, 2, 3])
})

test('works over async iterables', async () => {
  const source = (async function * () {
    yield 'a'
    yield 'b'
  }())
  const items = await collect(stopWhen(source, letter => letter === 'b'))
  expect(items).toEqual(['a'])
})

test('stops pulling from the source once the predicate fired', async () => {
  const produced = []
  const source = (async function * () {
    produced.push(1)
    yield 1
    produced.push(2)
    yield 2
    produced.push(3)
    yield 3
  }())

  const items = await collect(stopWhen(source, n => n === 2))

  expect(items).toEqual([1])
  expect(produced).toEqual([1, 2])
})

// Pipelean additions

test('passes the index as second argument', async () => {
  const seen = []
  await collect(stopWhen(['a', 'b', 'c'], (item, index) => {
    seen.push([item, index])
    return false
  }))
  expect(seen).toEqual([['a', 0], ['b', 1], ['c', 2]])
})

test('default predicate is never true', async () => {
  const items = await collect(stopWhen([1, 2, 3]))
  expect(items).toEqual([1, 2, 3])
})

test('predicate may close over counters like shouldHalt', async () => {
  let checks = 0
  const items = await collect(stopWhen([1, 2, 3, 4], () => ++checks > 2))
  expect(items).toEqual([1, 2])
})

test('early stop still runs the source cleanup', async () => {
  const {gen, state} = trackedSource([1, 2, 3])
  await collect(stopWhen(gen(), n => n === 2))
  expect(state.cleanedUp).toBe(true)
})

test('series consumes a stopped source and reports a clean run', async () => {
  const result = await series(stopWhen([1, 2, 3, 4], n => n === 3), x => x * 10)
  expect(result).toEqual({
    results: [10, 20], errors: [], sourceErrors: [], failure: false,
  })
})

test('reduce consumes a stopped source without a new option', async () => {
  const {
    value, errors, sourceErrors, failure,
  } = await reduce(
    stopWhen([1, 2, 3, 4], n => n === 3),
    (acc, x) => acc + x,
    0,
  )
  expect(value).toBe(3)
  expect(errors).toEqual([])
  expect(sourceErrors).toEqual([])
  expect(failure).toBe(false)
})

test('forwards array length so series keeps progress totals', async () => {
  const progress = []
  const result = await series(
    stopWhen([1, 2, 3, 4], n => n === 3),
    x => x * 10,
    {onProgress: value => progress.push(value)},
  )

  expect(result.results).toEqual([10, 20])
  expect(progress).toEqual([
    {
      item: 1, result: 10, index: 0, total: 4,
    },
    {
      item: 2, result: 20, index: 1, total: 4,
    },
  ])
})

test('generator sources still have no known total', async () => {
  async function * numbers () {
    yield 1
    yield 2
  }

  const progress = []
  await series(stopWhen(numbers(), () => false), x => x, {
    onProgress: value => progress.push(value),
  })
  expect(progress).toHaveLength(2)
  expect(Object.hasOwn(progress[0], 'total')).toBe(false)
})

test('a throwing predicate surfaces as a source error downstream', async () => {
  const bang = new Error('bang')
  const onSourceError = vi.fn()
  const onError = vi.fn()
  const result = await series(
    stopWhen([1, 2, 3], item => {
      if (item === 2)
        throw bang
      return false
    }),
    x => x,
    {onError, onSourceError},
  )

  expect(result.results).toEqual([1])
  expect(result.sourceErrors).toEqual([{error: bang, index: 1}])
  expect(onSourceError).toHaveBeenCalledWith({error: bang, index: 1})
  expect(onError).not.toHaveBeenCalled()
})

test('composes with take', async () => {
  const result = await series(
    stopWhen([1, 2, 3, 4, 5], n => n === 5),
    x => x * 10,
    {take: 2},
  )
  expect(result.results).toEqual([10, 20])
})

test('filter inherits the stopped source', async () => {
  const result = await filter(
    stopWhen([1, 2, 3, 4], n => n === 3),
    x => x % 2 === 1,
  )
  expect(result.results).toEqual([1])
})

// isPatternObject fix — iterable objects were misread as where() patterns

test('filter accepts async generator sources directly', async () => {
  async function * numbers () {
    yield 1
    yield 2
    yield 3
  }
  const result = await filter(numbers(), x => x % 2 === 1)
  expect(result.results).toEqual([1, 3])
})

test('filter still accepts pattern objects', async () => {
  const result = await filter([{active: true}, {active: false}], {active: true})
  expect(result.results).toEqual([{active: true}])
})
