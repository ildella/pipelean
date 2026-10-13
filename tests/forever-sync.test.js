import {test, expect} from 'vitest'
import {reduceSync} from '$src/functional-sync'
import {foreverSync, stopWhenSync} from '$src/iterables'

const collectStopped = predicate => {
  const items = []
  for (const item of stopWhenSync(foreverSync(), predicate))
    items.push(item)
  return items
}

test('yields the natural numbers from zero', () => {
  expect(collectStopped((_, index) => index === 4)).toEqual([0, 1, 2, 3])
})

test('stopWhenSync bounds the unbounded source', () => {
  let aborted = false
  const items = []
  for (const item of stopWhenSync(foreverSync(), () => aborted)) {
    items.push(item)
    aborted = item === 2
  }
  expect(items).toEqual([0, 1, 2])
})

test('reduceSync runs the daemon accumulator', () => {
  let aborted = false
  const {value, errors, failure} = reduceSync(
    stopWhenSync(foreverSync(), () => aborted),
    (state, index) => {
      state.cycles += 1
      aborted = index === 3
      return state
    },
    {cycles: 0},
  )
  expect(value).toEqual({cycles: 4})
  expect(errors).toEqual([])
  expect(failure).toBe(false)
})
