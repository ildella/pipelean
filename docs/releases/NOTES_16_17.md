# Release Notes v0.16 → v0.17

## The gap this release closes

`tryCatch` was the library's one silent swallow. Every other tool either reports
failure as data (the iterators' strategies) or propagates it (`retry`,
`mapSeries`, `foldSync`, `rethrow`). `tryCatch` alone turned a failure into
`undefined` by default, and that `undefined` was load-bearing: it is the drop
signal, so a failed step short-circuited `pipe` and vanished from `series`
without the run's strategy ever seeing it.

That fused two independent things:

- **Observing a failure** — report it, log it, metric it. A side effect.
- **Deciding what the failure becomes** — propagate, substitute, drop. Control
  flow.

`undefined` destroyed information: a caller could not tell "failed and was
swallowed" from "succeeded with no value" from "legitimately absent". And a
`tryCatch` inside `series` pre-empted the strategy, the "two error layers"
confusion the guide admitted to. 0.17 separates the two concerns and makes the
wrapper honest: **it never swallows by default.**

## Changed: `tryCatch` rethrows by default

`tryCatch(fn)` / `tryCatchSync(fn)` now run the operation, let the hooks observe,
and **rethrow the original error** on failure. Identity, message, stack and
`instanceof` survive. Inside `series`, the run's strategy therefore decides
policy again — a `tryCatch` mapper without `recover` just observes.

## Added: `recover` is the explicit failure→value seam

`recover({error}) => value` is the one place a failure becomes a value, spelled
out at the call site:

- `recover: () => undefined` is the explicit drop — behavior-identical to the
  0.16 default, and the way to keep a failed step short-circuiting `pipe` /
  dropping in `series`.
- Any other return value is a substitute; the error is consumed.
- A throwing `recover` propagates its own error (the original was already
  observed by `onError`).
- `onSuccess` does not run on a recovered value.
- A non-function `recover` is a `TypeError` when the wrapper is constructed.

The name deliberately matches the fold `recover` seam: one library-wide
vocabulary for "the explicit seam where a failure becomes a value and is
consumed". The context has no accumulator, because there is no iteration. `tryCatch` is still not a strategy and not a Result library —
returning `{ok, value|error}` is an app-layer composition built on `recover`.

## Added: one context object for hooks and `recover`

Every hook and `recover` now receive a single context object, and the wrapper
accepts an optional `name` label:

```js
const save = tryCatch(api.post, {
  name: 'saveSettings',
  onStart: ({args, name}) => log.info('start', name, args),
  onSuccess: ({result, args, name}) => log.info('done', name, result),
  onError: ({error, args, name}) => report({name, args, error}),
  onFinally: ({args, name}) => metrics.timing(name, args[0]),
  recover: ({error, name}) => ({ok: false, operation: name, error}),
})
```

- `args` is a copy of the wrapper invocation's argument list (an array),
  so a hook mutating it cannot change what `fn` received.
- `name` is the `name` option, or `undefined` when it is omitted.

There is no other context field. The hooks' and `recover`'s return values are
ignored, except `recover`'s, which is the substitute.

## Changed: a hook failure never masks the operation

The operation's outcome is primary; `onStart` gates it and `recover`
substitutes, while the other hooks never mask an operation error. All hooks are
awaited and their return values ignored.

The two rules:

1. **The operation failed** → throw its error. A throwing `onError` /
   `onFinally` never replaces it.
2. **A hook throws while the operation succeeded** → throw the hook error.

A hook error raised while the operation already failed is attached to the
primary as `error.hookErrors` (an array), best effort: if the primary cannot
carry the property (a primitive, a frozen / non-extensible object, or one that
rejects the write), the hook error is dropped and the primary is thrown
unchanged.

- `onStart` is a **boundary guard**: a throw skips `fn` and flows through
  `onError` + the failure policy like a `fn` failure.
- **Success path**: a throwing `onSuccess` / `onFinally` propagates as itself —
  a hook failure, never relabeled as the operation's failure. The first hook
  failure is the thrown error; a later one is attached to it as
  `error.hookErrors`.
- **After a successful `recover`** the operation counts as successful: if a
  hook threw earlier on the failure path, that hook error is thrown as itself.

This removes the old mislabels: a throwing `onSuccess` is no longer routed to
`onError` as an operation failure, and a throwing `onError` / `onFinally` no
longer overrides the operation error. The old "augment-and-rethrow by throwing
from `onError`" becomes: mutate the error in `onError` (it observes the same
object) and let the default rethrow carry it.

Attaching mutates the primary, so a reused error keeps only the latest
`hookErrors` (same caveat as `.failure`).

## Changed: `tryCatchSync` guards `recover`; fatal violations abort

`recover` joins `fn` and the hooks as a callback that must be synchronous: a
returned thenable is a fatal `TypeError` pointing at `tryCatch()`. The
`no-sync-async-callback` lint rule now inspects `recover` too. A fatal
sync-callback violation aborts the wrapper immediately — hooks that have not run
yet, including `onFinally`, are skipped.

## What we deliberately did not add

- **No Result type as the default.** An explicit `{ok, …}` outcome stays an
  app-layer composition; forcing every caller to unwrap would change `tryCatch`
  from an execution boundary into a result-conversion utility.
- **No new strategy surface.** Strategies still belong to the iterators.
- **No reporting sink at all.** The library never logs, and there is no
  configurable destination: a hook error is attached to the primary best effort
  and dropped when it cannot carry it. The app's own reporting stays in
  `onError`, where the operation error is available.

## Unchanged on purpose

- **`undefined` as the drop signal** in `series` / `filter` / `pipe` /
  `mapSeries` (and sync twins); `enrich` still requires `{}` for a no-op.
- **The fold `recover` seam**, strategy defaults, result shapes, and the
  bug-vs-data litmus are untouched.
- **`retry`** still retries then rethrows, so the surrounding strategy sees the
  failure.

## Migration

The default flip is the one breaking change. See
[migration.md](../migration.md#0170-trycatch-rethrows-by-default-recover-is-the-explicit-seam):
add `recover: () => undefined` to keep a swallow-and-drop boundary, and move any
"throw from `onError`" augment-and-rethrow to mutating the error in `onError`.
