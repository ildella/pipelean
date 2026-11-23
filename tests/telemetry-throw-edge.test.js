import {test, expect, vi} from 'vitest'
import {
  failFast, failLate, series, seriesSync, skip,
} from '$src/index'

const telemetryError = new Error('telemetry boom')

const failingAt = bad => value => {
  if (value === bad)
    throw new Error(`item boom at ${bad}`)
  return value
}

const throwingOnError = () => {
  throw telemetryError
}

const throwOnce = () => vi.fn().mockImplementationOnce(() => {
  throw telemetryError
})

test('skip: a throwing onError stops the run unreported', async () => {
  const input = [10, 20, 30]
  const opts = {strategy: skip, onError: throwingOnError}
  const expected = {
    results: [10], errors: [], sourceErrors: [], failure: false,
  }

  // The throw aborts iteration, but `skip` ignores source errors by contract:
  // it is neither collected nor thrown, and item 30 never runs.
  await expect(series(input, failingAt(20), opts)).resolves.toEqual(expected)
  expect(seriesSync(input, failingAt(20), opts)).toEqual(expected)
})

test('failFast: a throw-once onFailure fires twice and resolves', async () => {
  const onFailure = throwOnce()
  const expected = {
    results: [],
    errors: [],
    sourceErrors: [{error: telemetryError, index: 1}],
    failure: {error: telemetryError, index: 1},
  }

  // The first throw is reclassified as a source error and `onFailure` runs
  // again with the source context; that call returns normally, so the
  // telemetry error replaces the item error as the failure.
  await expect(series([10, 20], failingAt(20), {
    strategy: failFast,
    onFailure,
  })).resolves.toEqual(expected)
  expect(onFailure.mock.calls.map(([context]) => context.error.message))
    .toEqual(['item boom at 20', 'telemetry boom'])
  expect(onFailure).toHaveBeenCalledTimes(2)
})

test('failFast sync: a throw-once onFailure fires twice as well', () => {
  const onFailure = throwOnce()
  const result = seriesSync([10, 20], failingAt(20), {
    strategy: failFast,
    onFailure,
  })

  expect(onFailure).toHaveBeenCalledTimes(2)
  expect(result.sourceErrors).toEqual([{error: telemetryError, index: 1}])
  expect(result.failure).toEqual({error: telemetryError, index: 1})
})

test('failLate: a throw-once onFailure is not retried', async () => {
  const onFailure = throwOnce()

  // At settle there is no iteration loop to reclassify the throw: it escapes
  // on the first call.
  await expect(series([10, 20], failingAt(20), {
    strategy: failLate,
    onFailure,
  })).rejects.toBe(telemetryError)
  expect(onFailure).toHaveBeenCalledTimes(1)
})

test('failLate sync: a throw-once onFailure escapes first', () => {
  const onFailure = throwOnce()

  expect(() => seriesSync([10, 20], failingAt(20), {
    strategy: failLate,
    onFailure,
  })).toThrow(telemetryError)
  expect(onFailure).toHaveBeenCalledTimes(1)
})
