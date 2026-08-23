export const getKnownTotal = (items, total) =>
  total !== undefined ? total : items.length

// A where() pattern is a plain data object. Anything that can be iterated
// (arrays, generators, source adapters) is an input, not a pattern.
export const isPatternObject = x =>
  x !== null &&
  typeof x === 'object' &&
  !Array.isArray(x) &&
  !(Symbol.asyncIterator in x) &&
  !(Symbol.iterator in x)

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
