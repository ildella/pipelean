/**
 * Strategy identifiers, kept in an import-free module so `shared.js` and
 * `strategy.js` can both validate without importing each other.
 */

const STRATEGY_NAMES = new Set([
  'collect', 'failFast', 'failLate', 'skip', 'throw',
])

const REMOVED_ALIASES = new Set(['fail', 'stopOnError'])

/**
 * Normalize an error strategy to its canonical name, or throw a `TypeError`.
 *
 * Accepts the exported strategy objects (`{name}`) and bare strings. `rethrow`
 * is an alias of `throw`; `fail` and `stopOnError` were removed in 0.18.
 *
 * @param {{name: string}|string} strategy
 * @param {string} [label] API name used in the error message.
 * @returns {string}
 */
export const strategyNameOf = (strategy, label = 'pipelean') => {
  const name = strategy?.name ?? strategy

  if (REMOVED_ALIASES.has(name))
    throw new TypeError(
      `${label}() strategy "${name}" was removed in 0.18; use failFast`,
    )

  if (name === 'rethrow')
    return 'throw'

  if (typeof name !== 'string' || !STRATEGY_NAMES.has(name))
    throw new TypeError(
      `${label}() unknown strategy "${String(name)}"; ` +
      'use collect, failFast, failLate, skip or rethrow',
    )

  return name
}

export const assertStrategy = strategyNameOf
