# ESLint plugin

Pipelean ships an ESLint plugin that flags common async anti-patterns and
suggests pipelean equivalents. It is a **separate entry point** — importing it
does not pull in the runtime.

## Setup

```js
import pipeleanConfig from 'pipelean/eslint/config'

export default [
  pipeleanConfig,
  {
    rules: {
      'pipelean/no-loop-without-yield': 'warn',
      'pipelean/no-promise-combinators': 'warn',
    },
  },
]
```

Every rule defaults to `warn` in the ready-made flat config. The plugin itself
is also exported at `pipelean/eslint` for manual `plugins`/`rules` wiring.

## Advisory, not mandatory

The rules flag shapes and suggest pipelean equivalents; a warning is a prompt
to decide, not an order to rewrite. The decision gate comes first: if the code
needs no failure policy, no lifecycle and no structured report, plain
JavaScript is clearer and should stay
([when plain JavaScript is clearer](guide.md#when-plain-javascript-is-clearer)).
When the native code passes the gate, keep it and suppress the rule at that
site with an `eslint-disable-next-line` comment — do not rewrite working code
just to silence a warning. When the rewrite is warranted, follow
[Rewriting a hand-rolled loop safely](patterns.md#rewriting-a-hand-rolled-loop-safely).

## Rules

| rule | flags | suggests |
|---|---|---|
| `pipelean/no-array-foreach` | `.forEach()` | `series(items, fn)` |
| `pipelean/no-array-reduce` | `.reduce()` | `foldSync(items, reducer, initial)` for a pure sync fold, `reduce` when you need the report |
| `pipelean/no-array-map-async` | `.map(async ...)` | `series(items, fn)` |
| `pipelean/no-promise-combinators` | `Promise.all` / `Promise.allSettled` / … | `series` with a strategy, `join` for named tasks |
| `pipelean/no-loop-without-yield` | non-generator loops | generator sources consumed by pipelean |
| `pipelean/no-fold-rethrow` | `reduceSync(items, reducer, initial, {strategy: rethrow})` | `foldSync(items, reducer, initial)` |
| `pipelean/no-sync-async-callback` | async callback or hook passed to a `*Sync` combinator | drop `async`, or use the async combinator |

## `no-fold-rethrow` in depth

The rule flags `reduceSync(items, reducer, initial, {strategy: rethrow})` and
points at `foldSync`; a `recover` in the same options is exempt, because that is
a managed use where `onError` legitimately fires.

It also offers an editor suggestion — one keystroke — that rewrites the call to
an existing plain or aliased `foldSync` binding (or to `foldSync` itself), drops
a `.value` read and, only when no named `foldSync` binding exists, appends it to
a named `pipelean` import; with namespace/default-only imports (or none) that
insertion is skipped, so the callee may need a manual import. The suggestion is
opt-in: `eslint --fix` never applies it.

Shapes it cannot rewrite safely get the report only:

- a destructured or written `.value`;
- a read through another member such as `.failure` or `['value']`;
- more than four arguments;
- a pipelean default/namespace import already binding the name `foldSync`.

Other bindings of that name (a non-pipelean import, a local declaration) are not
scope-analyzed and may still get a colliding suggestion, which the opt-in
preview shows. The rule is deliberately narrow: aliased `reduceSync` imports and
member calls are not resolved.

## `no-sync-async-callback` in depth

Every `*Sync` combinator rejects a callback that returns a Promise: the runtime
raises a `TypeError` naming the async twin, and never collects the Promise as
data. The rule flags the literal form, so the mistake surfaces before the run:

```js
seriesSync(items, async x => x)                       // warn
enrichSync(ops, {onStepStart: async () => {}})         // warn
tryCatchSync(fn, {onFinally: async () => {}})          // warn
tryCatchSync(fn, {recover: async e => null})           // warn
seriesSync(items, x => x, {onProgress: async p => p})  // warn
```

It inspects the lifecycle hooks `onStepStart`, `onStepSuccess`, `onStart`,
`onSuccess`, `onError`, `onFinally`, the telemetry callbacks `onProgress`,
`onFailure`, `onSourceError`, and the `tryCatchSync` `recover` seam — the same
set the runtime guards. Sync hooks and
sync telemetry are the supported shape, and the same callbacks are fine on the
async combinator. Severity is `warn` like every rule.

Deliberately narrow, matching `no-fold-rethrow`: only bare calls whose callee
identifier ends in `Sync`, and only an inline function literal. Member calls,
aliased imports, a callback held in a variable, computed keys, spread properties
and nested options objects are not resolved, since that needs scope analysis.

## Related

- [Migration: 0.15.1 suggestion fixer](migration.md#0151-no-fold-rethrow-suggestion-fixer)
- [Migration: 0.15.0 `no-fold-rethrow` rule](migration.md#0150-assertok-throws-the-original-error)
- [Reference: `foldSync`](reference.md#foldsync)
