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
      title: album.title,
      name: error.name,
      content: error.message,
    })
  },
})
```

If `total` is unknown, Pipelean omits the key. Pass `total` explicitly when the planned count comes from a database query or another app-level source.

### Pattern 6: Album Enrichment with `flow()`

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
