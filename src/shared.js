const getKnownTotal = (items, total) =>
  total !== undefined ? total : items.length

export const getPlannedTotal = ({items, take, total}) => {
  const knownTotal = getKnownTotal(items, total)

  if (knownTotal === undefined)
    return undefined

  if (take === undefined)
    return knownTotal

  return Math.min(take, knownTotal)
}

export const withTotal = (payload, total) =>
  total === undefined ? payload : {...payload, total}

export const isThenable = value =>
  value !== null &&
  (typeof value === 'object' || typeof value === 'function') &&
  typeof value.then === 'function'

const SYNC_CALLBACK = Symbol('syncCallback')

// Swallows the rejection of a thenable `assertSyncResult` is abandoning.
const ignoreRejection = () => undefined

export const assertSyncResult = (value, subject, twin) => {
  if (!isThenable(value))
    return

  // Observe the abandoned thenable: otherwise a rejection crashes the
  // process with a second, unrelated error while we throw the TypeError.
  try {
    value.then(undefined, ignoreRejection)
  } catch {
    // A thenable whose `then` throws synchronously has nothing to observe.
  }

  const error = new TypeError(
    `${subject} returned a Promise; use ${twin}()`,
  )
  error[SYNC_CALLBACK] = true
  throw error
}

export const isSyncCallbackError = error =>
  Boolean(error) && error[SYNC_CALLBACK] === true

// `findSync` has no async twin; its guards point at `filter`, like its
// predicate guard.
const ASYNC_TWINS = {findSync: 'filter'}

const asyncTwinOf = label => ASYNC_TWINS[label] ?? label.replace(/Sync$/, '')

// Sync dispatch of a telemetry callback. `label` is the api name the run knows
// ('seriesSync'); it is undefined on the async path, where the same dispatch
// site awaits (or fires) the callback unchecked. Returns the result unchanged
// so wrappers can hand it back to the async path.
export const assertSyncCallback = (label, name, result) => {
  if (label === undefined)
    return result

  assertSyncResult(result, `${label}() ${name}`, asyncTwinOf(label))
  return result
}

// mapSeries() and mapSeriesSync() force `rethrow`, so an explicit conflicting
// strategy is a configuration mistake, never something to silently override.
export const assertRethrowStrategy = (strategy, label) => {
  if (strategy === undefined)
    return

  // `strategy` may be null: optional chaining keeps the intended TypeError
  // below instead of a "Cannot read properties of null" crash.
  const name = strategy?.name ?? strategy
  if (name !== 'throw')
    throw new TypeError(
      `${label}() always rethrows on the first error; ` +
      `remove the "${name}" strategy`,
    )
}

// Under the locked `rethrow` these callbacks can never fire, so accepting them
// would be dead configuration. Fail loudly instead of silently ignoring them.
const DEAD_ERROR_CALLBACKS = ['onError', 'onFailure', 'onSourceError']

export const assertNoErrorCallbacks = (opts, label) => {
  const dead = DEAD_ERROR_CALLBACKS.find(key => opts[key] !== undefined)

  if (dead === undefined)
    return

  // Name the offending key: the caller may have passed all three, and the
  // first one found is the only one this message can report.
  throw new TypeError(
    `${label}() rethrows on the first error; ` +
    `${dead} never fires — remove it or use series/seriesSync with a strategy`,
  )
}

// series() and seriesSync() share the call shape: either an immediate run
// (items, fn, opts) or a build-once pipeline (fn, opts).
export const parseCallArgs = args => {
  const immediate = typeof args[0] !== 'function'
  const [items, fn, opts = {}] = immediate
    ? args
    : [null, args[0], args[1]]

  return {
    immediate, items, fn, opts,
  }
}
