import {test, expect} from 'vitest'
import {filterSync, findSync, seriesSync} from '$src/functional-sync'
import {stopWhenSync} from '$src/iterables'

test('yields items until the predicate fires', () => {
  const items = [...stopWhenSync([1, 2, 3, 4], n => n === 3)]
  expect(items).toEqual([1, 2])
})

test('yields everything when the predicate never fires', () => {
  const items = [...stopWhenSync([1, 2], () => false)]
  expect(items).toEqual([1, 2])
})

test('yields nothing when the predicate fires immediately', () => {
  const items = [...stopWhenSync([1, 2], () => true)]
  expect(items).toEqual([])
})

test('passes each examined item to the predicate', () => {
  const seen = []
  const items = [...stopWhenSync([1, 2, 3], item => {
    seen.push(item)
    return false
  })]
  expect(items).toEqual([1, 2, 3])
  expect(seen).toEqual([1, 2, 3])
})

test('passes the index as second argument', () => {
  const seen = []
  const items = [...stopWhenSync(['a', 'b'], (item, index) => {
    seen.push([item, index])
    return false
  })]
  expect(items).toEqual(['a', 'b'])
  expect(seen).toEqual([['a', 0], ['b', 1]])
})

test('default predicate is never true', () => {
  const items = [...stopWhenSync([1, 2, 3])]
  expect(items).toEqual([1, 2, 3])
})

test('works over any sync iterable', () => {
  const items = [...stopWhenSync(new Set(['a', 'b', 'c']), l => l === 'c')]
  expect(items).toEqual(['a', 'b'])
})

test('stops pulling from the source once the predicate fired', () => {
  const produced = []
  function * source () {
    produced.push(1)
    yield 1
    produced.push(2)
    yield 2
    produced.push(3)
    yield 3
  }

  const items = [...stopWhenSync(source(), n => n === 2)]

  expect(items).toEqual([1])
  expect(produced).toEqual([1, 2])
})

test('early stop still runs the source cleanup', () => {
  const state = {cleanedUp: false}
  function * gen () {
    try {
      yield 1
      yield 2
      yield 3
    } finally {
      state.cleanedUp = true
    }
  }
  const items = [...stopWhenSync(gen(), n => n === 2)]
  expect(items).toEqual([1])
  expect(state.cleanedUp).toBe(true)
})

test('seriesSync consumes a stopped source and reports a clean run', () => {
  const result = seriesSync(
    stopWhenSync([1, 2, 3, 4], n => n === 3),
    x => x * 10,
  )
  expect(result).toEqual({
    results: [10, 20], errors: [], sourceErrors: [], failure: false,
  })
})

test('forwards array length so seriesSync keeps progress totals', () => {
  const progress = []
  seriesSync(stopWhenSync([1, 2, 3, 4], n => n === 3), x => x * 10, {
    onProgress: value => progress.push(value),
  })
  expect(progress).toEqual([
    {
      item: 1, result: 10, index: 0, total: 4,
    },
    {
      item: 2, result: 20, index: 1, total: 4,
    },
  ])
})

test('a throwing predicate surfaces as a source error downstream', () => {
  const bang = new Error('bang')
  const result = seriesSync(
    stopWhenSync([1, 2, 3], item => {
      if (item === 2)
        throw bang
      return false
    }),
    x => x,
  )

  expect(result.results).toEqual([1])
  expect(result.sourceErrors).toEqual([{error: bang, index: 1}])
})

test('filterSync inherits the stopped source', () => {
  const result = filterSync(
    stopWhenSync([1, 2, 3, 4], n => n === 3),
    x => x % 2 === 0,
  )
  expect(result.results).toEqual([2])
})

// isPatternObject fix — iterable objects were misread as where() patterns

test('filterSync accepts sync generator sources directly', () => {
  function * numbers () {
    yield 1
    yield 2
    yield 3
  }
  const result = filterSync(numbers(), x => x % 2 === 1)
  expect(result.results).toEqual([1, 3])
})

test('findSync accepts generator sources directly', () => {
  function * numbers () {
    yield 1
    yield 2
    yield 3
  }
  const result = findSync(numbers(), x => x > 1)
  expect(result.result).toBe(2)
})
