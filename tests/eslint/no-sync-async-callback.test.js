import {RuleTester} from 'eslint'
import rule from '$src/eslint/rules/no-sync-async-callback.js'

const tester = new RuleTester({
  languageOptions: {ecmaVersion: 2022, sourceType: 'module'},
})

tester.run('no-sync-async-callback', rule, {
  valid: [
    // Sync callbacks are the supported shape.
    {code: 'seriesSync(items, x => x)'},
    {code: 'seriesSync(items, function (x) { return x })'},
    {code: 'foldSync(items, (a, b) => a + b, 0)'},
    {code: 'tryCatchSync(() => 1)'},
    {code: 'pipeSync(x => x + 1)'},
    // Sync hooks in an options object are the supported shape.
    {
      code: 'enrichSync(ops, {onStepStart: ctx => ctx})',
    },
    {
      code: 'enrichSync(ops, {onStepSuccess: ctx => ctx})',
    },
    {
      code: 'tryCatchSync(fn, {onStart: () => {}, onFinally: () => {}})',
    },
    {
      code: 'tryCatchSync(fn, {onSuccess: r => r, onError: e => e})',
    },
    // Sync telemetry callbacks are the supported shape.
    {
      code: 'seriesSync(items, x => x, {onProgress: p => p})',
    },
    {
      code: 'scanSync(items, (acc, x) => acc + x, 0, {onFailure: e => e})',
    },
    {
      code: 'seriesSync(items, x => x, {onSourceError: e => e})',
    },
    // Non-Sync combinators accept async callbacks.
    {code: 'series(items, async x => x)'},
    {code: 'mapSeries(async x => x)'},
    {code: 'fold(items, async (a, b) => a, 0)'},
    // Non-Sync combinators accept async hooks too.
    {code: 'enrich(ops, {onStepStart: async ctx => ctx})'},
    {code: 'tryCatch(fn, {onFinally: async () => {}})'},
    // Non-Sync combinators accept async telemetry too.
    {code: 'series(items, x => x, {onProgress: async p => p})'},
    {code: 'filter(items, x => x, {onFailure: async e => e})'},
    {code: 'series(source, x => x, {onSourceError: async e => e})'},
    // Names that merely contain Sync are not sync combinators.
    {code: 'syncing(items, async x => x)'},
    // Documented limitation: a hook held in a variable is not resolved.
    {
      code: 'const onStepStart = async ctx => ctx\n' +
        'enrichSync(ops, {onStepStart})',
    },
    // Documented limitation: spread properties are not inspected.
    {code: 'enrichSync(ops, {...hooks})'},
    {code: 'tryCatchSync(fn, {...hooks, onStart: () => {}})'},
    // Documented limitation: computed keys are not inspected.
    {code: 'enrichSync(ops, {[key]: async ctx => ctx})'},
    // Documented limitation: nested objects are not inspected.
    {
      code: 'enrichSync(ops, {opts: {onStepStart: async ctx => ctx}})',
    },
    // Documented limitation: member expressions evade detection.
    {code: 'lib.seriesSync(items, async x => x)'},
    {code: 'lib.enrichSync(ops, {onStepStart: async ctx => ctx})'},
    {code: 'pipelean.foldSync(items, async (a, b) => a, 0)'},
    // Documented limitation: a callback reference is not resolved.
    {code: 'const f = async x => x\nseriesSync(items, f)'},
    // Documented limitation: only a literal function argument counts.
    {code: 'seriesSync(items, cond ? async x => x : f)'},
    // Not a call expression.
    {code: 'new seriesSync(async () => 1)'},
  ],
  invalid: [
    {
      code: 'seriesSync(items, async x => x)',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'mapSeriesSync(async x => x)',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'filterSync(items, async x => x)',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'findSync(items, async x => x)',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'scanSync(items, async (acc, x) => acc + x, 0)',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'reduceSync(items, async (acc, x) => acc + x, 0, {})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'foldSync(items, async (a, b) => a, 0)',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'pipeSync(async x => x)',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'enrichSync(ops, async x => x)',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      // async FunctionExpression form.
      code: 'seriesSync(items, async function (x) { return x })',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'foldSync(items, async function (a, b) { return a }, 0)',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      // The message names the offending call.
      code: 'tryCatchSync(async () => 1)',
      errors: [
        {
          message:
            'tryCatchSync() callbacks must be synchronous; use the async ' +
            'twin (e.g. series, mapSeries, filter, reduce)',
        },
      ],
    },
    // Async hooks in a direct options object are rejected at runtime too.
    {
      code: 'enrichSync(ops, {onStepStart: async ctx => ctx})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'enrichSync(ops, {onStepSuccess: async ctx => ctx})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'tryCatchSync(fn, {onStart: async () => {}})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'tryCatchSync(fn, {onSuccess: async r => r})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'tryCatchSync(fn, {onError: async e => e})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'tryCatchSync(fn, {onFinally: async () => {}})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      // async FunctionExpression hook form.
      code: 'enrichSync(ops, {onStepStart: async function (ctx) {' +
        ' return ctx }})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      // Reported once per call, not once per hook.
      code: 'tryCatchSync(fn, {onStart: async () => {},' +
        ' onFinally: async () => {}})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    // Async telemetry is rejected at runtime too (0.16 telemetry guard).
    {
      code: 'seriesSync(items, x => x, {onProgress: async p => p})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'scanSync(items, (acc, x) => acc + x, 0,' +
        ' {onFailure: async e => e})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'seriesSync(items, x => x, {onSourceError: async e => e})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      // async FunctionExpression telemetry form.
      code: 'enrichSync(ops, {onFailure: async function (e) { return e }})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      // A direct async argument and an async hook still report once.
      code: 'enrichSync(async x => x, {onStepStart: async ctx => ctx})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
  ],
})
