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

  throw new TypeError(
    `${label}() rethrows on the first error; ` +
    'onError/onFailure/onSourceError never fire — remove them or use ' +
    'series/seriesSync with a strategy',
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
