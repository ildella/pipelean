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

### Pattern 8: Album Enrichment with `flow()`

Use `flow()` when an app task enriches **one** input through multiple stateful steps (e.g., derive `title`, `year`, `artists`, `slug` from a raw payload). Define the pipeline once, then run it against any number of inputs.

```javascript
import { flow, collect } from 'pipelean'

const processAlbum = flow([
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

Use `stopWhen()` when a run should stop pulling items once a condition is met: a user-requested cancel, a batch limit, or a content-based stop. The predicate is checked **before** each item is offered downstream, so the triggering item is never processed. It composes with every pipelean consumer — wrap the source, keep your options untouched:

```javascript
import { series, stopWhen } from 'pipelean'

const { results } = await series(enrichOne, {
  total: albums.length,        // forwarded from the array — optional with stopWhen
  pause: ENRICH_DELAY_MS,
  pauseOnErrors: true,
  onProgress: onItem,
})(stopWhen(albums, shouldStop))
```

The predicate receives `(item, index)` and may close over external state instead of looking at the item at all — that covers cancel flags and limits with one combinator:

```javascript
stopWhen(albums, shouldStop)                    // cancel flag
stopWhen(folders, () => count >= limit)         // batch limit
stopWhen(pages, page => page.isLast)            // content-based stop
```

Stopping is a clean completion for the consumer: `failure` stays `false`, `sourceErrors` stays empty — cancel is a shorter run, not an error. Once stopped, the underlying source is abandoned mid-stream and its cleanup (`finally`, `iterator.return()`) still runs.

Two things `stopWhen` does **not** do:

- it does not abort work already started on an item — intra-item cancellation stays in your operation (e.g. `AbortController`);
- it is not a `series` option on purpose: wrapping the source also serves raw `for await` loops and `reduce`/`scan` pipelines, where a consumer option would not reach.
