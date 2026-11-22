import {test, expect, vi} from 'vitest'
import {enrichSync} from '$src/index'

// `enrichSync` calls hooks fire-and-forget: it never looks at their return
// value. A rejected promise is therefore invisible to the strategy, which
// still completes synchronously with the merged value. Hand the hook an
// ALREADY-CAUGHT rejection so the test itself does not leak an unhandled
// rejection into the run.
const caughtRejection = message => {
  const rejected = Promise.reject(new Error(message))
  rejected.catch(() => undefined)

  return rejected
}

test('an async onStepStart is not awaited by enrichSync', () => {
  const onStepStart = vi.fn(() => caughtRejection('start hook'))
  const pipeline = enrichSync([() => ({a: 1})], {onStepStart})

  const result = pipeline({seed: 0})

  expect(result).not.toBeInstanceOf(Promise)
  expect(onStepStart).toHaveBeenCalledOnce()
  expect(result).toEqual({value: {seed: 0, a: 1}, errors: [], failure: false})
})

test('an async onStepSuccess is not awaited by enrichSync', () => {
  const onStepSuccess = vi.fn(() => caughtRejection('success hook'))
  const pipeline = enrichSync([
    () => ({a: 1}),
    () => ({b: 2}),
  ], {onStepSuccess})

  const result = pipeline({})

  expect(result).not.toBeInstanceOf(Promise)
  expect(onStepSuccess).toHaveBeenCalledTimes(2)
  expect(result).toEqual({value: {a: 1, b: 2}, errors: [], failure: false})
})
