/**
 * Disallow reduceSync with strategy: rethrow used as a value extractor.
 *
 * `reduceSync(items, reducer, initial, {strategy: rethrow}).value` is
 * behavior-identical to `foldSync(items, reducer, initial)` for a pure sync
 * fold, but pays for a managed report nobody reads. This rule pushes that
 * shape to foldSync.
 *
 * Deliberately narrow, to keep false positives at zero:
 * - Only calls whose callee is the bare Identifier `reduceSync` and whose 4th
 *   argument is an inline ObjectExpression.
 * - `recover` in the same opts object exempts the call: onError legitimately
 *   fires before the recovery seam, so migrating to foldSync would silently
 *   drop recovery. That is a managed use, not the value-extraction smell.
 * - Async reduce/series/filter/scan with rethrow are never reported: raw
 *   async use is the supported home for rethrow.
 * - Aliased imports (`import {reduceSync as rs}`, `import {rethrow as boom}`)
 *   and member-expression calls (`pipelean.reduceSync(...)`) evade detection.
 *   Intentional narrowness: resolving bindings reliably would drag in
 *   re-exports, computed keys and spread opts, and the extra complexity buys
 *   little over the plain case.
 */

const isNamedProperty = (name, property) => {
  if (property.type !== 'Property' || property.computed)
    return false

  const key = property.key
  if (key.type === 'Identifier')
    return key.name === name

  if (key.type === 'Literal')
    return key.value === name

  return false
}

const isRethrowValue = value =>
  (value.type === 'Identifier' && value.name === 'rethrow') ||
  (value.type === 'Literal' && value.value === 'throw')

const hasKey = (name, opts) =>
  opts.properties.some(property => isNamedProperty(name, property))

const hasRethrowStrategy = opts =>
  opts.properties.some(
    property =>
      isNamedProperty('strategy', property) &&
      isRethrowValue(property.value)
  )

const isOptsObject = node => Boolean(node) && node.type === 'ObjectExpression'

const isBareReduceSyncCall = node =>
  node.callee.type === 'Identifier' && node.callee.name === 'reduceSync'

const isValueExtraction = node => {
  const opts = node.arguments[3]
  if (!isOptsObject(opts) || !hasRethrowStrategy(opts))
    return false

  return !hasKey('recover', opts)
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow reduceSync with strategy: rethrow for value ' +
        'extraction; prefer foldSync',
    },
    messages: {
      preferFoldSync:
        'foldSync(items, reducer, initial) returns the value directly. ' +
        'Use it for a pure sync fold; keep reduceSync and assertOk when ' +
        'you need the report.',
    },
  },

  create (context) {
    return {
      CallExpression (node) {
        if (isBareReduceSyncCall(node) && isValueExtraction(node))
          context.report({node, messageId: 'preferFoldSync'})
      },
    }
  },
}
