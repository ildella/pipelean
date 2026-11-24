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
| map many items concurrently, with a cap | `p-map` | `series` is sequential by design; `join` is for a few named branches and has no concurrency cap |
| a queue, rate limit or scheduler | `p-queue`, `p-throttle`, `p-limit` | `pause` is a delay between items, not a scheduler: no queue, no priority, no interval cap |
| retry with backoff, jitter, abort or error selection | `p-retry` | `retry` is attempts plus a fixed delay, nothing else |
| push-based or reactive streams | RxJS (or `most`, `bacon.js`) | Pipelean is pull-based and eager: there is no subscription and no operator chain to build |
| lazy pipelines over iterables | IxJS, `iter-tools` | Pipelean consumes iterables; it does not build lazy operator chains |
| streaming ETL: backpressure, Node/Web Streams, CSV/JSON | [exstream-js](https://exstream-js.github.io/) | no buffer policy, watermarks, destinations or format operators |
| a typed effect system with dependency injection | Effect, `fp-ts` | no monads, no typed error channel, no application runtime |
| `Result` / `Either` as the primary type | `neverthrow`, `oxide.ts` | results are plain report envelopes guarded by `assertOk`, not a `Result` type |
| CPU parallelism | `worker_threads`, `piscina` | everything runs on the same event loop: I/O concurrency only |

The map is a boundary, not a catalogue: pick the layer that owns the problem,
and keep the run in Pipelean.

## How they combine

The usual pattern is a division of labour: the other library owns the transport,
the scheduling or the concurrency; Pipelean owns what happens to one item or one
finished batch, with a report.

### p-map inside a `series` item

`series` gives the run its order and its failure policy. `p-map` gives one batch
its concurrency: concurrent mapping with a cap, with variants that mirror the
`Promise` combinators — `pMapSettled` for `allSettled`, `pMapIterable` for a
streaming result, and `pMapSkip` / `pMapStop` to drop a result or end the
iteration like `break`.

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
regardless of which request finished first. By default the first mapper
rejection rejects the call (`stopOnError: true`); `{stopOnError: false}` waits
for everything and rejects with an `AggregateError`. Either way `series` records
one item error, and `collect` keeps going with the next account. If one bad user
should not fail the whole account, use `pMapSettled` and decide inside the
mapper.

Do not invert this to get concurrency: wrapping `series` in `pMap` runs several
sequential runs at once, which is a different (and usually accidental) policy.

### exstream-js for the flow, Pipelean for the records

exstream-js is record-oriented streaming ETL for JavaScript. It connects async
iterables, Node.js streams and Web Streams to transforms and destinations,
parses and writes CSV/JSON/JSON Lines incrementally, supports bounded async
concurrency (`mapAsync({concurrency})`), reliable forks and merges, and exposes
error policy as part of the flow (`errors()`, `skipErrors()`, `failOnError()`,
`routeErrors()`, `stopOnError()`). Pipelines are lazy: nothing is read until a
terminal consumer (`pipeTo()`, `toArray()`, `for await`) asks for data, and
backpressure travels from the destination back to the source. Reach for it when
the flow itself is the problem — a large or unbounded input, a slow destination,
several outputs, cancellation across the whole chain.

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

`series` consumes that iterable one item at a time and always awaits the mapper,
so a slow mapper naturally slows the source. What it does not add is a
configurable streaming system: there is no buffer policy, no high/low
watermarks, no destination management and no format operator. That is exstream's
job.

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

The boundary in one sentence: Pipelean owns the run — many items, one failure
policy, one report, one lifecycle. How the data arrives, how fast it moves, and
where the CPU work happens belong to another library. The full list of what
Pipelean leaves out is [What Pipelean is not](../README.md#what-pipelean-is-not).

## Related

- [Pipelean for functional programmers](fp-mapping.md) — the vocabulary mapping,
  and where the analogy to `Either`/`traverse` stops.
- [When plain JavaScript is clearer](guide.md#when-plain-javascript-is-clearer) —
  the gate before adopting Pipelean at all.
- [Result shapes](reference.md#result-shapes) — what the envelope contains.
