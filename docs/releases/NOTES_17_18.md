# Release Notes v0.17 → v0.18

## The gap this release closes

One concept had four shapes. `series` returned `results`, `reduce` returned
`value`, `findSync` returned `result`. `sourceErrors` appeared on iterators and
disappeared on `enrich` / `join`. And `failure` was typed `false | object`: a
success sentinel, an item context, a source context and a `failLate` aggregate
all sharing one slot with no way to tell them apart except by sniffing keys.

The envelope itself was already shared — one strategy engine, one
`createRunState` / `toResult` pair, one normalized error contract. The drift was
in the payload name, in the presence of the source-error channel, and in the
absence of a type. 0.18 closes those three seams.

## Changed: `findSync` returns `value`

`findSync` was the only single-value API whose payload key was not `value`. Its
payload means exactly what `reduce`'s does — the one value the run selected, or
`undefined` when nothing matched — so the name now matches.

This is the release's one breaking change:

```js
const {value} = findSync(items, predicate)
```

## Added: `sourceErrors` on `enrich`, `enrichSync` and `join`

A step fold and a task fork have no external source, so a source error is
structurally impossible there. The key was omitted; now it is always present and
always empty, and every managed result can be read with the same destructuring.
Generic code that guarded with `result.sourceErrors ?? []` can drop the guard.

## Added: the `failure` union is named

The JSDoc now documents what the code always produced: `false` on success, an
item or step context under `failFast`, a source context for a dead source, and a
`{errors}` aggregate under `failLate` — per combinator, because `enrich` cannot
produce a source failure and `join` cannot produce a `failFast` item failure.
This is a documentation and editor-boundary change; the runtime payloads are
byte-for-byte what they were.

## Unchanged on purpose

- **`results` vs `value`**: the payload key names its cardinality, not the
  combinator. `scan` keeps every accumulator, so it stays `results`; a single
  accumulator or record stays `value`.
- **The `false` sentinel** for `failure`. Switching it to `null` would break
  every `=== false` check for no gain.
- **The separate `sourceErrors` channel.** It is not merged into `errors`: a
  dead source bypasses `recover` and has its own callbacks, and that distinction
  is contract guarantee 5.
- **Strategy defaults and the `undefined` drop sentinel.**

## Migration

The `findSync` rename is the only code change required. See
[migration.md](../migration.md#0180-one-result-envelope-everywhere).
