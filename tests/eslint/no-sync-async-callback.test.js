import {RuleTester} from 'eslint'
import rule from '$src/eslint/rules/no-sync-async-callback.js'

const tester = new RuleTester({
  languageOptions: {ecmaVersion: 2022, sourceType: 'module'},
})

tester.run('no-sync-async-callback', rule, {
  valid: [
    {code: 'seriesSync(items, x => x)'},
    {code: 'seriesSync(items, function (x) { return x })'},
    {code: 'foldSync(items, (a, b) => a + b, 0)'},
    {code: 'tryCatchSync(() => 1)'},
    {code: 'pipeSync(x => x + 1)'},
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
    {
      code: 'tryCatchSync(fn, {recover: e => null})',
    },
    {
      code: 'seriesSync(items, x => x, {onProgress: p => p})',
    },
    {
      code: 'scanSync(items, (acc, x) => acc + x, 0, {onFailure: e => e})',
    },
    {
      code: 'seriesSync(items, x => x, {onSourceError: e => e})',
    },
    {code: 'series(items, async x => x)'},
    {code: 'mapSeries(async x => x)'},
    {code: 'fold(items, async (a, b) => a, 0)'},
    {code: 'enrich(ops, {onStepStart: async ctx => ctx})'},
    {code: 'tryCatch(fn, {onFinally: async () => {}})'},
    {code: 'tryCatch(fn, {recover: async e => null})'},
    {code: 'series(items, x => x, {onProgress: async p => p})'},
    {code: 'filter(items, x => x, {onFailure: async e => e})'},
    {code: 'series(source, x => x, {onSourceError: async e => e})'},
    {code: 'syncing(items, async x => x)'},
    {
      code: 'const onStepStart = async ctx => ctx\n' +
        'enrichSync(ops, {onStepStart})',
    },
    {code: 'enrichSync(ops, {...hooks})'},
    {code: 'tryCatchSync(fn, {...hooks, onStart: () => {}})'},
    {code: 'enrichSync(ops, {[key]: async ctx => ctx})'},
    {
      code: 'enrichSync(ops, {opts: {onStepStart: async ctx => ctx}})',
    },
    {code: 'lib.seriesSync(items, async x => x)'},
    {code: 'lib.enrichSync(ops, {onStepStart: async ctx => ctx})'},
    {code: 'pipelean.foldSync(items, async (a, b) => a, 0)'},
    {code: 'const f = async x => x\nseriesSync(items, f)'},
    {code: 'seriesSync(items, cond ? async x => x : f)'},
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
      code: 'seriesSync(items, async function (x) { return x })',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'foldSync(items, async function (a, b) { return a }, 0)',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'tryCatchSync(async () => 1)',
      errors: [
        {
          message:
            'tryCatchSync() callbacks must be synchronous; use the async ' +
            'twin (e.g. series, mapSeries, filter, reduce)',
        },
      ],
    },
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
      code: 'tryCatchSync(fn, {recover: async e => null})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'enrichSync(ops, {onStepStart: async function (ctx) {' +
        ' return ctx }})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'tryCatchSync(fn, {onStart: async () => {},' +
        ' onFinally: async () => {}})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
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
      code: 'enrichSync(ops, {onFailure: async function (e) { return e }})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
    {
      code: 'enrichSync(async x => x, {onStepStart: async ctx => ctx})',
      errors: [{messageId: 'noAsyncCallback'}],
    },
  ],
})
