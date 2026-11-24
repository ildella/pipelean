# When to reach for another library

Pipelean solves one problem well: execute a run of async work with an explicit
failure policy, a structured report, and a lifecycle you can see. It is
deliberately not a platform. When the problem is concurrency, scheduling,
streaming, typed effects or CPU parallelism, another library is the right answer
— and it is more useful to say which one than to pretend the boundary does not
exist.

None of the libraries below replaces Pipelean, and Pipelean does not replace
them. They sit at different layers, and most real systems use two of them
together.

## The map

| If your problem is… | Reach for… | Because Pipelean deliberately does not… |
|---|---|---|
| map many items concurrently, with a cap | `p-map` — `pMap`, `pMapSettled`, `pMapSkip`, `pMapStop` | `series` is sequential by design; `join` is for a few named branches and has no concurrency cap |
| a queue, rate limit or scheduler | `p-queue`, `p-throttle`, `p-limit` | `pause` is a delay between items, not a scheduler: no queue, no priority, no interval cap |
| retry with backoff, jitter, abort or error selection | `p-retry` | `retry` is attempts plus a fixed delay, nothing else |
| push-based or reactive streams | RxJS (or `most`, `bacon.js`) | Pipelean is pull-based and eager: there is no subscription and no operator chain to build |
| lazy pipelines over iterables | IxJS, `iter-tools` | Pipelean consumes iterables; it does not build lazy operator chains |
| a typed effect system with dependency injection | Effect, `fp-ts` | no monads, no typed error channel, no application runtime |
| `Result` / `Either` as the primary type | `neverthrow`, `oxide.ts` | results are plain report envelopes guarded by `assertOk`, not a `Result` type |
| streaming ETL: backpressure, Node/Web Streams, CSV/JSON | [exstream-js](https://exstream-js.github.io/) | Pipelean is not a stream adapter: no backpressure, no destinations, no format operators |
| classic collection helpers (`eachSeries`, `mapLimit`, `queue`) | `async` (caolan) | Pipelean is narrower and built around one error model, not a helper catalogue |
| CPU parallelism | `worker_threads`, `piscina` | everything runs on the same event loop: I/O concurrency only |

Two rows deserve more than a sentence.

**p-map** is `Promise.all` with a concurrency cap. `pMap` returns results in
input order; `pMapSettled` mirrors `Promise.allSettled` and never rejects on a
mapper error; `pMapSkip` drops one result from the output; `pMapStop` ends the
iteration like `break`. Its error model is throw-based: by default the first
mapper rejection rejects the whole call (`stopOnError: true`), while
`{stopOnError: false}` waits for everything and rejects with an
`AggregateError`. If you want errors as data for the whole run, keep the p-map
call inside a `series` item and let the run's strategy handle the batch failure.

**exstream-js** is record-oriented streaming ETL for JavaScript. It connects
async iterables, Node.js streams and Web Streams to transforms and destinations,
parses and writes CSV/JSON/JSON Lines incrementally, supports bounded async
concurrency (`mapAsync({concurrency})`), reliable forks and merges, and exposes
error policy as part of the flow (`errors()`, `skipErrors()`, `failOnError()`,
`routeErrors()`, `stopOnError()`). Pipelines are lazy: nothing is read until a
terminal consumer (`pipeTo()`, `toArray()`, `for await`) asks for data, and
backpressure travels from the destination back to the source. Reach for it when
the flow itself is the problem — a large or unbounded input, a slow destination,
several outputs, cancellation across the whole chain.

## How they combine

The usual pattern is a division of labour: the other library owns the transport,
the scheduling or the concurrency; Pipelean owns what happens to one item or one
finished batch, with a report.

### p-map inside a `series` item

`series` gives the run its order and its failure policy. `p-map` gives one
batch its concurrency.

```js
import pMap from 'p-map'
import {series, collect} from 'pipelean'

// series owns the batch order and the failure policy for the run;
// p-map owns the concurrency inside one batch.
const {results, errors} = await series(accounts, async account => {
  const users = await pMap(account.userIds, fetchUser, {concurrency: 4})
  return {account: account.id, users}
}, {
  strategy: collect,
  onError: ({item, error}) => log.warn(item.id, error),
})
```

`pMap` resolves in input order, so the shape of each result is deterministic
regardless of which request finished first. The first mapper rejection rejects
the `pMap` call, which `series` records as one item error; `collect` keeps going
with the next account. If one bad user should not fail the whole account, use
`pMapSettled` and decide inside the mapper.

Do not invert this to get concurrency: wrapping `series` in `pMap` runs several
sequential runs at once, which is a different (and usually accidental) policy.

### exstream-js for the flow, Pipelean for the records

An exstream pipeline is async iterable, and `series` consumes anything
`for await` accepts, so the handoff is the iterator protocol rather than an
adapter.

```js
import {createReadStream} from 'node:fs'
import exstream from 'exstream.js'
import {series, collect} from 'pipelean'

// exstream owns the stream: incremental CSV parsing, backpressure, cleanup.
const rows = exstream(createReadStream('orders.csv')).csv({header: true})

// pipelean owns the run over the records that come out of it.
const {results, errors, sourceErrors} = await series(rows, indexOrder, {
  strategy: collect,
  pause: 25,
  onProgress: ({index}) => report(index),
})
```

Keep the responsibilities separate. Record-level routing belongs to exstream
(`errors()`, `routeErrors()`); a stream that dies mid-way reaches Pipelean as a
source error and lands in `sourceErrors`, not in `errors`. Do not configure both
layers to retry the same record — pick one owner for that policy.

### RxJS for the event source, Pipelean for the batch

RxJS owns the subscription, the time window and the teardown. Pipelean owns what
happens to one batch.

```js
import {fromEvent, bufferTime, filter, concatMap, from} from 'rxjs'
import {series, failFast} from 'pipelean'

const clicks = fromEvent(saveButton, 'click')

clicks.pipe(
  bufferTime(1000),
  filter(batch => batch.length > 0),
  concatMap(batch => from(series(batch, sendEvent, {strategy: failFast}))),
).subscribe(({failure, errors}) => {
  if (failure) report(errors)
})
```

`concatMap` keeps batches ordered and waits for the previous `series` run to
finish; use `mergeMap` only when overlapping batches are acceptable. One
boundary to remember: unsubscribing stops the events, not an in-flight `series`
run. Cancelling the run is still `signal`, and cancelling work inside one item
is still the operation's own job.

## What Pipelean deliberately does not do

The limitations are design decisions, not a backlog. Each one is a place where
another library is a better fit.

- **Lazy operator chains.** Execution is eager: calling `series` starts work and
  resolves to a report. There is no deferred program to build, compose and
  interpret later. If you need to describe a pipeline without running it, that
  is IxJS or `iter-tools` for pull-based iterables, or exstream-js for a stream.
- **Scheduling and rate limiting.** `pause` inserts a delay between items — a
  number, or a function of the item and index — and `signal` stops between
  items. There is no queue, no priority, no interval cap and no way to change
  concurrency while a run is in progress. That is `p-queue`, `p-throttle` or
  `p-limit`.
- **Backpressure.** `series` pulls one item at a time, so a slow mapper does
  slow an async generator; that is pull-based flow, not a backpressure system.
  There are no high/low watermarks, no buffer policy, no Node/Web stream
  adapter, and no destination management. That is exstream-js.
- **Cancellation inside an item.** `signal` is checked before each item and
  while waiting in `pause`; it never interrupts the in-flight mapper. Pass your
  own `AbortSignal` to `fetch` or the database call and handle it in the
  operation.
- **Typed errors and a `Result` type.** The envelope is a plain runtime object,
  `failure` is `false` or a context object (`{item, error, index}`, `{errors}`),
  and `assertOk(result)` is a guard — not a discriminated union you `map` and
  `andThen` over. There are no TypeScript declarations yet. For a real `Result`
  type, use `neverthrow` or `oxide.ts`; for typed effects and dependency
  injection, Effect or `fp-ts`.
- **CPU parallelism.** Every combinator runs on the same event loop, and `join`
  is I/O concurrency, not a thread pool. CPU-bound work belongs in
  `worker_threads` or `piscina`.

The boundary in one sentence: Pipelean owns the run — many items, one failure
policy, one report, one lifecycle. How the data arrives, how fast it moves, and
where the CPU work happens belong to another library.

## Related

- [Pipelean for functional programmers](fp-mapping.md) — the vocabulary mapping,
  and where the analogy to `Either`/`traverse` stops.
- [When plain JavaScript is clearer](guide.md#when-plain-javascript-is-clearer) —
  the gate before adopting Pipelean at all.
- [Result shapes](reference.md#result-shapes) — what the envelope contains.
- [Limitations](../README.md#limitations) — the same boundaries from the README.
