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
