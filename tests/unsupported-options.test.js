import {test, expect, vi} from 'vitest'
import {
  collect, enrich, enrichSync, filter, filterSync, findSync, join, mapSeries,
  reduce, reduceSync, scan, scanSync, series, seriesSync,
} from '$src/index'

const noop = () => undefined

const unsupported = (label, key) =>
  `${label}() does not support the "${key}" option`

const add = (acc, x) => acc + x

const FOLD_APIS = [
  ['scan', 'scan/reduce', opts => scan([1, 2], add, 0, opts)],
  ['reduce', 'scan/reduce', opts => reduce([1, 2], add, 0, opts)],
  ['scanSync', 'scanSync', opts => scanSync([1, 2], add, 0, opts)],
  ['reduceSync', 'reduceSync', opts => reduceSync([1, 2], add, 0, opts)],
]

const FOLD_OPTIONS = [
  ['take', () => 1],
  ['total', () => 2],
  ['onProgress', () => noop],
  ['onUndefined', () => 'error'],
]

const FIND_OPTIONS = [
  ['onProgress', () => noop],
  ['onUndefined', () => 'error'],
]

const LIFECYCLE_OPTIONS = [
  ['signal', () => new AbortController().signal],
  ['pause', () => 5],
  ['pauseOnErrors', () => true],
  ['onSourceError', () => noop],
  ['onProgress', () => noop],
  ['take', () => 1],
  ['total', () => 2],
  ['onUndefined', () => 'error'],
]

const ENRICH_APIS = [
  ['enrich', 'enrich', opts => enrich([], opts)],
  ['enrichSync', 'enrichSync', opts => enrichSync([], opts)],
]

const captureError = fn => {
  try {
    fn()
  } catch (error) {
    return error
  }

  return undefined
}

const captureRejection = async run => {
  try {
    await run()
  } catch (error) {
    return error
  }

  return undefined
}

test.each(FOLD_APIS)(
  '%s rejects the known-but-unsupported fold options',
  (_name, label, run) => {
    for (const [key, make] of FOLD_OPTIONS) {
      const error = captureError(() => run({[key]: make()}))

      expect(error).toBeInstanceOf(TypeError)
      expect(error.message).toBe(unsupported(label, key))
    }
  },
)

test('findSync rejects onProgress and onUndefined', () => {
  const run = opts => findSync([1, 2], x => x === 2, opts)

  for (const [key, make] of FIND_OPTIONS) {
    const error = captureError(() => run({[key]: make()}))

    expect(error).toBeInstanceOf(TypeError)
    expect(error.message).toBe(unsupported('findSync', key))
  }
})

test.each([
  ['filter', 'filter', opts => filter([1, 2], x => x === 2, opts)],
  ['filterSync', 'filterSync', opts => filterSync([1, 2], x => x === 2, opts)],
])('%s rejects onUndefined', (_name, label, run) => {
  const error = captureError(() => run({onUndefined: 'error'}))

  expect(error).toBeInstanceOf(TypeError)
  expect(error.message).toBe(unsupported(label, 'onUndefined'))
})

test('curried filter and findSync reject at construction', () => {
  const filterError = captureError(() =>
    filter(x => x, {onUndefined: 'error'}))
  const filterSyncError = captureError(() =>
    filterSync(x => x, {onUndefined: 'error'}))
  const findError = captureError(() => findSync(x => x, {onProgress: noop}))

  expect(filterError.message).toBe(unsupported('filter', 'onUndefined'))
  expect(filterSyncError.message).toBe(unsupported('filterSync', 'onUndefined'))
  expect(findError.message).toBe(unsupported('findSync', 'onProgress'))
})

test.each(ENRICH_APIS)(
  '%s rejects the run lifecycle options at construction',
  (_name, label, build) => {
    for (const [key, make] of LIFECYCLE_OPTIONS) {
      const error = captureError(() => build({[key]: make()}))

      expect(error).toBeInstanceOf(TypeError)
      expect(error.message).toBe(unsupported(label, key))
    }
  },
)

test('enrich rejects before any operation runs', () => {
  const operation = vi.fn(() => ({}))

  expect(() => enrich([operation], {take: 1})).toThrow(TypeError)
  expect(operation).not.toHaveBeenCalled()
})
test.each(LIFECYCLE_OPTIONS)(
  'join rejects the "%s" option before starting branches',
  async (key, make) => {
    const branch = vi.fn(() => 1)
    const error = await captureRejection(() =>
      join({a: branch}, {[key]: make()}))

    expect(error).toBeInstanceOf(TypeError)
    expect(error.message).toBe(unsupported('join', key))
    expect(branch).not.toHaveBeenCalled()
  },
)

test('recover keeps its dedicated message on enrich and join', async () => {
  const enrichError = captureError(() => enrich([], {recover: () => ({})}))
  const enrichSyncError = captureError(() =>
    enrichSync([], {recover: () => ({})}))
  const joinError = await captureRejection(() =>
    join({}, {recover: () => ({})}))

  expect(enrichError.message).toBe(
    'enrich does not support recover; use reduce if fold recovery is needed',
  )
  expect(enrichSyncError.message).toBe(
    'enrichSync does not support recover; use reduce if fold recovery is ' +
    'needed',
  )
  expect(joinError.message).toBe('join() does not support recover')
})

test('explicitly undefined options are not rejected', async () => {
  const opts = Object.fromEntries(
    LIFECYCLE_OPTIONS.map(([key]) => [key, undefined]),
  )

  await expect(scan([1], add, 0, opts)).resolves.toMatchObject({results: [1]})
  await expect(reduce([1], add, 0, opts)).resolves.toMatchObject({value: 1})
  expect(scanSync([1], (acc, x) => acc + x, 0, opts).results).toEqual([1])
  expect(reduceSync([1], (acc, x) => acc + x, 0, opts).value).toBe(1)
  expect(findSync([1], x => x === 1, opts).value).toBe(1)
  expect(filterSync([1], x => x === 1, opts).results).toEqual([1])
  await expect(filter([1], x => x === 1, opts))
    .resolves.toMatchObject({results: [1]})
  await expect(enrich([], opts)({})).resolves.toMatchObject({value: {}})
  expect(enrichSync([], opts)({}).value).toEqual({})
  await expect(join({a: () => 1}, opts))
    .resolves.toMatchObject({value: {a: 1}})
})

test('folds keep accepting the options they own', async () => {
  const onError = vi.fn()
  const onSourceError = vi.fn()

  const result = await scan([1, 2], (acc, item) => acc + item, 0, {
    strategy: collect,
    onError,
    onSourceError,
    pause: 0,
    signal: new AbortController().signal,
  })

  expect(result.results).toEqual([1, 3])
  expect(onError).not.toHaveBeenCalled()
  expect(onSourceError).not.toHaveBeenCalled()
})

test('filter, findSync and enrich keep their own options', async () => {
  const onProgress = vi.fn()
  const filtered = await filter([1, 2, 3], x => x > 1, {
    take: 2, total: 3, onProgress,
  })

  expect(filtered.results).toEqual([2])
  expect(onProgress).toHaveBeenCalledTimes(1)

  const found = findSync([1, 2, 3], x => x > 1, {take: 2, total: 3})

  expect(found.value).toBe(2)

  const enriched = await enrich([state => ({n: state.n + 1})], {
    strategy: collect,
  })({n: 1})

  expect(enriched.value).toEqual({n: 2})
})

test('join keeps accepting strategy and onError', async () => {
  const onError = vi.fn()
  const result = await join({
    a: () => 1,
    b: () => {
      throw new Error('b')
    },
  }, {strategy: collect, onError})

  expect(result.value).toEqual({a: 1})
  expect(onError).toHaveBeenCalledTimes(1)
})

test('series and mapSeries still accept the core run options', async () => {
  const onProgress = vi.fn()
  const result = await series([1, 2], x => x, {
    take: 1, total: 2, onProgress, onUndefined: 'error',
  })

  expect(result.results).toEqual([1])
  expect(onProgress).toHaveBeenCalledTimes(1)

  await expect(mapSeries([1, 2], x => x, {
    take: 1, total: 2, signal: new AbortController().signal,
  })).resolves.toEqual([1])

  expect(seriesSync([1, 2], x => x, {
    take: 1, total: 2, onUndefined: 'error',
  }).results).toEqual([1])
})
