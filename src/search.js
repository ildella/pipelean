export const where = pattern => item =>
  Object.entries(pattern).every(([key, value]) => item[key] === value)

const isPattern = x => x !== null &&
  typeof x === 'object' &&
  !Array.isArray(x)

const toPredicate = x => isPattern(x) ? where(x) : x

export const parseSearchArgs = (args, defaultOpts) => {
  const immediate = typeof args[0] !== 'function' && !isPattern(args[0])
  const [items, rawPredicate, opts] = immediate
    ? args
    : [null, args[0], args[1]]

  return {
    immediate,
    items,
    predicate: toPredicate(rawPredicate),
    opts: opts ?? defaultOpts,
  }
}
