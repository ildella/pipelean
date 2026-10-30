## Error Handling Patterns

### Pattern 1: Logging + Detection (`collect` + `onError`)

```javascript
await series(items, fn, {
  strategy: collect,
  onError: ({item, error}) => logger.error({item, error})
})
// Check failure manually: if (result.errors.length > 0) { ... }
```

### Pattern 2: Best-effort + Monitoring (`skip` + `onError`)

```javascript
await series(items, fn, {
  strategy: skip,
  onError: ({item, error}) => metrics.increment('errors', {item, error})
})
// Result has no errors array, failure is false
```

### Pattern 3: Critical Fail + UI (`failFast` + `onFailure`)

```javascript
await series(items, fn, {
  strategy: failFast,
  onFailure: (failure) => {
    showErrorModal(failure.error.message)
    rollbackChanges()
  }
})
```

### Don't ignore the outcome (`assertOk`)

`failFast` stops the run but does not throw: `failure` is a returned field. Code
that awaits the result and never inspects it — a scheduler, a script, a startup
job — can stop silently. `assertOk` is the guard for that gap:

```javascript
import {assertOk, series} from 'pipelean'

const result = assertOk(await series(jobs, importJob, {strategy: failFast}))
// truthy failure → throws with `cause` and `failure`; no failure → same object
```

It checks `failure`, not `errors`: under `collect` / `skip`, errors are data by
design and `assertOk` returns the result. Pair it with `failFast` / `failLate`
when a silent stop must be impossible.

### Pattern 4: Application Wrapper with Default `onFailure`

```javascript
const withErrorHandling = (opts) => ({
  ...opts,
  onFailure: (failure) => {
    if (failure.errors) {
      showToast('Some items failed')
    } else {
      showToast(`Error: ${failure.error.message}`)
    }
    if (opts.onFailure) opts.onFailure(failure)
  }
})

await series(items, fn, withErrorHandling({strategy: failFast}))
```

### Pattern 5: App Task + UI Progress

Use `series()` when an app task needs one loop, predictable errors, and progress updates. The query and UI state stay in the app; Pipelean owns the iteration, callback timing, and final outcome.

```javascript
const albumsToSync = await getAlbumsByStatus({statusFilter})

const result = await series(albumsToSync, album => importAlbum({
  sourceId: album.sourceId,
  libraryId: album.libraryId,
  fast,
}), {
  take: limit,
  strategy: collect,
  onProgress: ({index, total}) => {
    operation.sync.total = total
    operation.sync.current = index + 1
  },
  onError: ({item, error}) => {
    reportAlbumImportError({
      sourceId: item.sourceId,
      title: item.title,
      name: error.name,
      content: error.message,
    })
  },
})
```

If `total` is unknown, Pipelean omits the key. Pass `total` explicitly when the planned count comes from a database query or another app-level source.

### Pattern 6: Async generator + live progress + rate limit

`series` consumes anything `for await` can walk — including paging generators. Progress is live and serial; `pause` spaces successful items.

```javascript
import {series, collect} from 'pipelean'

async function* pages(db) {
  let cursor
  do {
    const page = await db.nextPage(cursor)
    cursor = page.cursor
    yield page
  } while (cursor)
}

const {results, errors, sourceErrors} = await series(
  pages(db),
  page => importPage(page),
  {
    strategy: collect,
    pause: 200,
    onProgress: ({item, result, index, total}) => {
      // total is omitted — a generator has no cheap length
      setStatus(`imported ${index + 1}`)
    },
    onError: ({item, error}) => reportPage(item, error),
    onSourceError: ({error, index}) => {
      log.warn('pager died', {error, index})
    },
  },
)
// results: every page imported before a source death
// sourceErrors: [{error, index}] if the generator threw
```

### Pattern 7: Dead source — keep what you have

When the iterable itself throws (connection drop, generator `throw`), that is a **source error**, not an item error. It never reaches `onError`. Under `collect`, partial `results` survive.

```javascript
const result = await series(pages(db), processPage, {
  strategy: collect,
  onSourceError: ({error, index}) => log.warn('source died', {error, index}),
})
// result.results — every item processed before the drop
// result.sourceErrors — [{error, index}]
// result.failure — false under collect
```

### Pattern 8: Album Enrichment with `enrich()`

Use `enrich()` when an app task enriches **one** input through multiple stateful steps (e.g., derive `title`, `year`, `artists`, `slug` from a raw payload). Define the pipeline once, then run it against any number of inputs.

```javascript
import { enrich, collect } from 'pipelean'

const processAlbum = enrich([
  state => ({title: state.rawTitle.trim()}),
  state => ({year: parseYear(state.rawYear)}),
  state => ({artists: state.artists ?? []}),
  state => ({slug: `${state.year}-${state.title.toLowerCase().replace(/\s+/g, '-')}`}),
], {
  onError: ({operation, error, index, total}) => {
    reportEnrichmentError({step: operation, error, index, total})
  },
})

for (const rawAlbum of rawAlbums) {
  const {value, errors, failure} = await processAlbum(rawAlbum)
  await persistAlbum(value)
}
```

Operations are reusable building blocks. The same `processAlbum` can be called from a CLI import script, a REST endpoint, or a background job — and the error shapes are normalized (`operation` is the function's `name` or `operation-${index}`), so error reports are consistent across entry points.

### Pattern 9: Cancel / limit a run with `stopWhen()`

Use `stopWhen()` when the decision is about the **source**: a batch limit, a content sentinel, or any predicate over the item. The predicate is checked **before** each item is offered downstream, so the triggering item is never processed. It composes with every pipelean consumer — wrap the source, keep your options untouched:

```javascript
import { series, stopWhen } from 'pipelean'

const { results } = await series(enrichOne, {
  total: albums.length,        // forwarded from the array — optional with stopWhen
  pause: ENRICH_DELAY_MS,
  pauseOnErrors: true,
  onProgress: onItem,
})(stopWhen(albums, shouldStop))
```

The predicate receives `(item, index)` and may close over external state instead of looking at the item at all — so counters and limits work with one combinator:

```javascript
stopWhen(folders, () => count >= limit)         // batch limit
stopWhen(pages, page => page.isLast)            // content-based stop
```

Stopping is a clean completion for the consumer: `failure` stays `false`, `sourceErrors` stays empty — cancel is a shorter run, not an error. Once stopped, the underlying source is abandoned mid-stream and its cleanup (`finally`, `iterator.return()`) still runs.

Two things `stopWhen` does **not** do:

- it does not abort work already started on an item — intra-item cancellation stays in your operation (e.g. `AbortController`);
- it is not a `series` option on purpose: wrapping the source also serves raw `for await` loops and `reduce`/`scan` pipelines.

For a **lifecycle** stop (user cancel, shutdown, a parent request ending) use the `signal` option instead: it is checked before each item and while `pause` is pending, keeps the completed result, and needs no source wrapper. `stopWhen` stays for domain limits; `signal` owns cancellation. They compose.

### Pattern 10: Daemon loop with `forever()` + `signal`

Some loops have no items: repeat a step until a signal says stop — a poller, a worker tick, a long-running service loop. There are no pages to stream and no albums to enrich; the rounds themselves are the only thing being iterated. `forever()` yields the tick indices with no end, `reduce` carries the loop's state without accumulating results, `signal` ends the loop at a round boundary, and `pause` owns the cadence:

```javascript
import { reduce, rethrow, forever } from 'pipelean'

await reduce(
  forever(),
  async state => {
    await runRound(state)                         // one pass, immediately
    return {...state, cycles: state.cycles + 1}
  },
  { cycles: 0, failures: 0 },
  {
    signal: controller.signal,                    // lifecycle stop
    pause: everyMs,                               // the cadence, abort-aware
    strategy: rethrow,
  },
)
```

The rules that make this the daemon shape:

- `reduce`, not `series`: a daemon has no results to keep, and `reduce` returns only the final state — no accumulation over an unbounded source;
- `signal` is the lifecycle stop: checked before each round and while pausing. An abort during a round lets that round finish and keeps its accumulator, then stops without waiting the remaining pause;
- `pause` is the loop cadence: a number or `(accumulator, item, index) => ms`, resolved after the scanner update. There is no hand-rolled interruptible sleep;
- `rethrow`: a fatal error (infrastructure death, not a handled tick failure) must exit the loop, not be collected into it — tick-level failures are contained inside the scanner, as they were inside the `while` body.

`stopWhen(forever(), predicate)` remains the right tool when the bound is a **domain** condition — a max number of rounds, a stop flag produced by one of them — and can be layered on top of `signal`.

The same composition covers pollers (`read, then pause before the next read`) and fixed-cadence workers; the sync twin is `foreverSync()` + `stopWhenSync()`.

### Pattern 11: Service loop that survives failed rounds

Pattern 10 lets a fatal error exit the loop. The opposite shape is just as common: the loop must **keep going across failed rounds** — a board sync whose HTTP call bursts, a poller that gets a 502, a worker tick whose job throws. Hand-writing this means a `try/catch` inside the round, a hand-rolled backoff, and a second copy of that backoff in the catch block.

`recover` is the fold-local seam for exactly that. A thrown round is reported through `onError`, turned into the next accumulator by `recover`, and the loop continues on the recovered state:

```javascript
import { reduce, rethrow, forever } from 'pipelean'

await reduce(
  forever(),
  async state => {
    const results = await runner.sync({full: state.full})   // may throw
    writeRound({results, io})
    return {
      ...state,
      full: false,
      failures: failedRound(results) ? state.failures + 1 : 0,
    }
  },
  {failures: 0, full: true},
  {
    signal: controller.signal,
    strategy: rethrow,                                       // fatal errors still exit
    onError: ({error}) => io.stderr.write(`${error.message}\n`),
    recover: ({state}) => ({
      ...state,
      full: false,
      failures: state.failures + 1,                          // same failure accounting
    }),
    pause: state => backoffWait({base: everyMs, failures: state.failures}),
  },
)
```

What makes this the recipe:

- **`recover` returns the next accumulator, not a patch.** It receives `state` — the accumulator *before* the failed round — so failure accounting is identical to the scanner's own path.
- **`onError` still fires under `rethrow`.** Recovery handles the item error, so telemetry is never suppressed; without `recover`, `rethrow` stays silent.
- **The recovered error is consumed.** `errors` stays empty, `failure` stays `false`, `onFailure` is not called; the loop's outcome stays clean.
- **`pause` runs after a recovery** regardless of `pauseOnErrors`, and sees the recovered state — the backoff sequence is computed from the incremented `failures`.
- **A failing `recover` is not swallowed.** If your recovery logic itself throws, that error goes through the strategy: with `rethrow` the loop exits, with `collect` it is recorded.
- **Source death and external cleanup stay outside the seam.** A generator dying mid-stream is a source error; the caller's `try/finally` for external resources remains the caller's business (there are no lifecycle hooks).

`recover` exists only on `scan` / `reduce` (and `scanSync` / `reduceSync`). On `series` / `filter` / `findSync` / `enrich` / `join` / `pipe` it is a `TypeError`, because there is no accumulator to recover into.
