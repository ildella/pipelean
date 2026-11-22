/**
 * Disallow reduceSync with strategy: rethrow used as a value extractor.
 *
 * `reduceSync(items, reducer, initial, {strategy: rethrow}).value` is
 * behavior-identical to `foldSync(items, reducer, initial)` for a pure sync
 * fold, but pays for a managed report nobody reads.
 *
 * Deliberately narrow: only bare `reduceSync(...)` calls whose 4th argument
 * is an inline ObjectExpression are reported. `recover` in the same opts
 * exempts the call (onError fires before the recovery seam, so migrating would
 * drop recovery); async reduce/series/filter/scan with rethrow are never
 * reported; aliased imports and member calls (`pipelean.reduceSync(...)`)
 * evade detection on purpose, since resolving bindings would drag in
 * re-exports, computed keys and spread opts for little gain.
 *
 * A suggestion is emitted only when the rewrite is runnable and
 * behaviour-identical. When the report is read only through `.value` (the
 * migration codemod shape) that access is dropped too:
 * `reduceSync(a, f, z, opts).value` becomes `foldSync(a, f, z)`. Not
 * cosmetic: foldSync returns the raw accumulated value, so
 * `foldSync(...).value` would read a property it does not have.
 *
 * Everything else is reported without a suggestion: any other report shape,
 * destructuring the result (variable declarator, assignment target or
 * parameter default), writing through `.value` (assignment, update, delete,
 * for-in/for-of or a destructuring pattern), and calls with more than four
 * arguments.
 *
 * Residual evasion, out of scope by design: a member access not directly on
 * the call (`const r = reduceSync(...); r.value`), and pattern wrappers
 * outside the set the helper walks.
 *
 * `foldSync` is resolved against every `pipelean` import. An existing plain
 * or aliased binding is reused (the call uses its local name and nothing is
 * inserted); otherwise it is appended to a named import, preferring the one
 * binding `reduceSync`. `reduceSync` is never removed (it may be used
 * elsewhere). With only namespace/default imports the import edit is skipped
 * and the call is rewritten alone, leaving the callee unresolved until the
 * author adds it. Opt-in on purpose: import edits make blind `--fix` unsafe.
 */
import {reportOnly, suggestionFixes} from './no-fold-rethrow-suggestion.js'

const REDUCE_SYNC = 'reduceSync'

const propertyName = property => {
  if (property.type !== 'Property' || property.computed)
    return null

  const {key} = property
  return key.type === 'Identifier' ? key.name : key.value
}

const isRethrowValue = value =>
  (value.type === 'Identifier' && value.name === 'rethrow') ||
  (value.type === 'Literal' && value.value === 'throw')

const hasKey = (name, opts) =>
  opts.properties.some(property => propertyName(property) === name)

const hasRethrowStrategy = opts =>
  opts.properties.some(
    property =>
      propertyName(property) === 'strategy' &&
      isRethrowValue(property.value)
  )

const isBareReduceSyncCall = node =>
  node.callee.type === 'Identifier' && node.callee.name === REDUCE_SYNC

const isValueExtraction = node => {
  const opts = node.arguments[3]
  const isOpts = Boolean(opts) && opts.type === 'ObjectExpression'
  if (!isOpts || !hasRethrowStrategy(opts))
    return false

  return !hasKey('recover', opts)
}

export default {
  meta: {
    type: 'suggestion',
    hasSuggestions: true,
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
      replaceWithFoldSync:
        'Replace with foldSync(items, reducer, initial)',
    },
  },

  create (context) {
    const {sourceCode} = context

    return {
      CallExpression (node) {
        if (!isBareReduceSyncCall(node) || !isValueExtraction(node))
          return

        const report = {node, messageId: 'preferFoldSync'}
        if (reportOnly(node)) {
          context.report(report)
          return
        }

        context.report({
          ...report,
          suggest: [
            {
              messageId: 'replaceWithFoldSync',
              fix: fixer => suggestionFixes(fixer, sourceCode, node),
            },
          ],
        })
      },
    }
  },
}
