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
