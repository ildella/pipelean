import {test, expect} from 'vitest'
import {collect, reduceSync, seriesSync} from '$src/index'

const scanner = (acc, item) => {
  if (item === 2)
    throw new Error('item boom')
  return acc + item
}

const asyncReject = async () => await Promise.reject(new Error('boom'))

// A thenable abandoned by a sync guard used to crash the process with a
// second, unrelated error. Collect what the process reports as unhandled
// while `run` finishes, so a leaked rejection fails the expectations below.
const unhandledWhileRunning = async run => {
  const proc = globalThis.process
  const reasons = []
  const listener = reason => reasons.push(reason)
  proc.on('unhandledRejection', listener)

  try {
    const outcome = run()
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
    return {outcome, reasons}
  } finally {
    proc.removeListener('unhandledRejection', listener)
  }
}

test('a rejecting async recover leaks no rejection', async () => {
  const {outcome: result, reasons} = await unhandledWhileRunning(() =>
    reduceSync([1, 2, 3], scanner, 0, {recover: asyncReject}))

  expect(result.value).toBe(1)
  expect(result.failure.error).toBeInstanceOf(TypeError)
  expect(result.failure.error.message)
    .toBe('recover must be synchronous in sync folds')
  expect(result.errors).toEqual([])
  expect(reasons).toEqual([])
})

test('a rejecting async recover is collected as data', async () => {
  const {outcome: result, reasons} = await unhandledWhileRunning(() =>
    reduceSync([1, 2], scanner, 0, {strategy: collect, recover: asyncReject}))

  expect(result.value).toBe(1)
  expect(result.errors[0].error).toBeInstanceOf(TypeError)
  expect(result.errors[0].error.message)
    .toBe('recover must be synchronous in sync folds')
  expect(result.failure).toBe(false)
  expect(reasons).toEqual([])
})

// `then` that returns a rejected promise instead of routing through `reject`:
// the guard must observe the returned thenable too, or it leaks.
const thenReturnsRejection = () => ({
  then: () => Promise.reject(new Error('leaked')),
})

test('a thenable whose then returns a rejection leaks nothing', async () => {
  const {reasons} = await unhandledWhileRunning(() => {
    expect(() => seriesSync([1], thenReturnsRejection))
      .toThrow('seriesSync() mapper returned a Promise; use series()')
  })

  expect(reasons).toEqual([])
})
