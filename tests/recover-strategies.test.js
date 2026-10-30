import {
  test, expect, vi,
} from 'vitest'
import {
  enrich, failLate, filter, forever, join, reduce, rethrow, series,
} from '$src/index'

const boom = item => {
  if (item === 2)
    throw new Error('boom')
  return item
}

const recoverThrows = () => {
  throw new Error('recover boom')
}

test('throwing recover under failFast stops', async () => {
  const result = await reduce([1, 2, 3], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {strategy: 'failFast', recover: recoverThrows})

  expect(result.failure.error.message).toBe('recover boom')
  expect(result.failure.item).toBe(2)
  expect(result.errors).toEqual([])
})

test('a throwing recover under collect records the recover error', async () => {
  const result = await reduce([1, 2, 3], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {strategy: 'collect', recover: recoverThrows})

  expect(result.errors).toHaveLength(1)
  expect(result.errors[0].error.message).toBe('recover boom')
  expect(result.failure).toBe(false)
  expect(result.value).toBe(4)
})

test('a throwing recover under failLate fails at the end', async () => {
  const result = await reduce([1, 2], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {strategy: failLate, recover: recoverThrows})

  expect(result.failure.errors[0].error.message).toBe('recover boom')
})

test('a throwing recover under skip is ignored', async () => {
  const result = await reduce([1, 2, 3], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {strategy: 'skip', recover: recoverThrows})

  expect(result).toEqual({
    value: 4, errors: [], sourceErrors: [], failure: false,
  })
})

test('throwing recover under rethrow rejects', async () => {
  const onError = vi.fn()

  await expect(reduce([1, 2], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {strategy: rethrow, recover: recoverThrows, onError}))
    .rejects.toThrow('recover boom')

  // Only the original scanner error was reported: rethrow does not notify.
  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError.mock.calls[0][0].error.message).toBe('boom')
})

test('many recovered errors over forever() keep errors empty', async () => {
  const controller = new AbortController()

  const {value, errors, failure} = await reduce(
    forever(),
    () => {
      throw new Error('round failed')
    },
    {failures: 0},
    {
      strategy: rethrow,
      recover: ({state}) => {
        const failures = state.failures + 1
        if (failures === 50)
          controller.abort()
        return {failures}
      },
      signal: controller.signal,
    },
  )

  expect(value).toEqual({failures: 50})
  expect(errors).toEqual([])
  expect(failure).toBe(false)
})

test.each([
  ['series', () => series([1], x => x, {recover: () => 0})],
  ['filter', () => filter([1], x => x, {recover: () => 0})],
  ['enrich', () => enrich([state => state], {recover: () => 0})],
])('%s rejects recover with a TypeError', (_name, run) => {
  expect(run).toThrow(TypeError)
})

test('join rejects recover with a TypeError', async () => {
  await expect(join({a: () => 1}, {recover: () => 0}))
    .rejects.toThrow(TypeError)
})

test('a non-function recover throws a TypeError', () => {
  expect(() => reduce([1], x => x, 0, {recover: 42})).toThrow(TypeError)
})

test('the board-sync loop survives failed rounds', async () => {
  vi.useFakeTimers()

  const everyMs = 100
  const backoffWait = ({base, failures}) => base * 2 ** failures
  const writeRound = vi.fn()
  const logged = []
  const io = {stderr: {write: line => logged.push(line)}}
  const controller = new AbortController()

  let round = 0
  const runner = {
    sync: () => {
      const current = round++
      if (current === 0)
        throw new Error('sync burst failed')
      if (current === 1)
        return {failed: true}
      if (current === 2)
        return {failed: false}

      controller.abort()
      return {failed: false}
    },
  }

  const pause = vi.fn(state => backoffWait({
    base: everyMs, failures: state.failures,
  }))

  const promise = reduce(
    forever(),
    async state => {
      const results = await runner.sync({full: state.full})
      writeRound({results, io})
      return {
        ...state,
        full: false,
        failures: results.failed ? state.failures + 1 : 0,
      }
    },
    {failures: 0, full: true},
    {
      signal: controller.signal,
      strategy: rethrow,
      onError: ({error}) => io.stderr.write(`${error.message}\n`),
      recover: ({state}) => ({
        ...state,
        full: false,
        failures: state.failures + 1,
      }),
      pause,
    },
  )

  await vi.runAllTimersAsync()
  const result = await promise

  expect(pause.mock.calls.map(([state]) => state.failures))
    .toEqual([1, 2, 0])
  expect(writeRound).toHaveBeenCalledTimes(3)
  expect(logged).toEqual(['sync burst failed\n'])
  expect(result).toEqual({
    value: {failures: 0, full: false},
    errors: [],
    sourceErrors: [],
    failure: false,
  })
})
