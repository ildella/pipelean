/**
 * Disallow async callbacks passed directly to *Sync combinators.
 *
 * Every sync combinator rejects a callback that returns a promise at runtime
 * (`assertSyncResult` raises a TypeError naming the async twin), so an async
 * callback is always a bug. This rule catches the literal form statically.
 *
 * Two shapes are reported: an inline async function argument
 * (`seriesSync(items, async x => x)`) and an async callback in a direct
 * options object (`enrichSync(ops, {onStepStart: async ...})`,
 * `tryCatchSync(fn, {onFinally: async () => ...})`). The inspected keys are
 * the lifecycle hooks (onStepStart, onStepSuccess, onStart, onSuccess,
 * onError, onFinally) and the telemetry callbacks (onProgress, onFailure,
 * onSourceError): since 0.16 the runtime guards all of them on the sync
 * combinators, so the static rule mirrors the whole set.
 *
 * Deliberately narrow, matching `no-fold-rethrow`: only bare `foo(...)`
 * calls whose callee identifier ends in `Sync`, and only when an argument is
 * an inline function literal. Member calls (`lib.seriesSync(...)`), aliased
 * imports and a callback or hook held in a variable evade detection on
 * purpose, since resolving them needs scope analysis. Inside an options
 * object, computed keys, spread properties and nested objects are ignored
 * for the same reason.
 */
import propertyName from './property-name.js'

const SYNC_SUFFIX = 'Sync'

const HOOK_KEYS = new Set([
  'onStepStart',
  'onStepSuccess',
  'onStart',
  'onSuccess',
  'onError',
  'onFinally',
  'onProgress',
  'onFailure',
  'onSourceError',
])

const isSyncCall = node =>
  node.callee.type === 'Identifier' &&
  node.callee.name.endsWith(SYNC_SUFFIX)

const isAsyncFunction = node =>
  (node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression') &&
    node.async

const isAsyncHook = property =>
  HOOK_KEYS.has(propertyName(property)) &&
  isAsyncFunction(property.value)

const hasAsyncHook = node =>
  node.arguments.some(
    arg =>
      arg.type === 'ObjectExpression' &&
      arg.properties.some(isAsyncHook)
  )

const hasAsyncCallback = node =>
  node.arguments.some(isAsyncFunction) || hasAsyncHook(node)

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow async callbacks and hooks passed to *Sync combinators',
    },
    messages: {
      noAsyncCallback:
        '{{name}}() callbacks must be synchronous; use the async twin ' +
        '(e.g. series, mapSeries, filter, reduce)',
    },
  },

  create (context) {
    return {
      CallExpression (node) {
        if (!isSyncCall(node) || !hasAsyncCallback(node))
          return

        context.report({
          node,
          messageId: 'noAsyncCallback',
          data: {name: node.callee.name},
        })
      },
    }
  },
}
