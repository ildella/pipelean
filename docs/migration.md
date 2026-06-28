# Migration Guide

How to replace common imperative and error-prone patterns with pipelean equivalents.

## 0.7: `series()` callbacks receive context objects

Pipelean 0.7 changes `series()` lifecycle callbacks from raw values to named context objects. This is a breaking change, but it makes app tasks easier to write because UI progress and error reporting get the item, index, result/error, and known total in one place.

### `onProgress(result)` → `onProgress({result})`

**Before:**
```js
await series(items, fn, {
  onProgress: result => updateUi(result),
})
```

**After:**
```js
await series(items, fn, {
  onProgress: ({result}) => updateUi(result),
})
```

The full progress payload is:

```js
{item, result, index, total}
```

`total` is omitted when Pipelean cannot know it cheaply. Pass `total` explicitly when the planned count comes from your app:

```js
await series(items, fn, {
  total: items.length,
  onProgress: ({index, total}) => updateProgress(index + 1, total),
})
```

If `take` is set, callback `total` means planned execution total:

```js
await series(items, fn, {
  take: 10,
  total: 100,
  onProgress: ({total}) => {
    // total is 10
  },
})
```

### `onError(error)` → `onError({error})`

**Before:**
```js
await series(items, fn, {
  strategy: collect,
  onError: error => report(error),
})
```

**After:**
```js
await series(items, fn, {
  strategy: collect,
  onError: ({item, error, index}) => report({item, error, index}),
})
```

Collected errors now also include `index`:

```js
const {errors} = await series(items, fn, {strategy: collect})
// errors = [{item, error, index}]
```

### `failFast` failure includes `index`

**Before:**
```js
const result = await series(items, fn, {strategy: failFast})
// result.failure = {item, error}
```

**After:**
```js
const result = await series(items, fn, {strategy: failFast})
// result.failure = {item, error, index}
```

`onFailure` receives the same shape:

```js
await series(items, fn, {
  strategy: failFast,
  onFailure: ({item, error, index}) => showItemError(item, error, index),
})
```

### `failLate` failure changes from `true` to `{errors}`

**Before:**
```js
const result = await series(items, fn, {strategy: failLate})

if (result.failure === true) {
  showToast('Some items failed')
}
```

**After:**
```js
const result = await series(items, fn, {strategy: failLate})

if (result.failure) {
  showToast(`${result.failure.errors.length} items failed`)
}
```

`onFailure` receives `{errors}`:

```js
await series(items, fn, {
  strategy: failLate,
  onFailure: ({errors}) => showToast(`${errors.length} items failed`),
})
```

### `throw` does not call lifecycle callbacks

In `series()`, `throw` now throws the original error immediately and does not call `onError` or `onFailure`.

```js
await series(items, fn, {
  strategy: rethrow,
  onError: () => {
    // not called
  },
  onFailure: () => {
    // not called
  },
})
```

### App task progress example

```js
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

## for-loop with try/catch → series

**Before:**
```js
const results = []
const errors = []
for (const item of items) {
  try {
    results.push(await process(item))
  } catch (e) {
    errors.push({item, error: e})
  }
}
```

**After:**
```js
import { series, collect } from 'pipelean'
const { results, errors } = await series(items, process, { strategy: collect })
```

## .forEach() with async → series

**Before:**
```js
items.forEach(async (item) => {
  await process(item) // errors silently swallowed!
})
```

**After:**
```js
import { series } from 'pipelean'
await series(items, process)
```

## .reduce() → scan

**Before:**
```js
const total = await items.reduce(async (acc, item) => {
  const sum = await acc
  return sum + (await getValue(item))
}, Promise.resolve(0))
```

**After:**
```js
import { scan } from 'pipelean'
const { results } = await scan(items, (acc, item) => acc + getValue(item), 0)
```

## .filter().map() (two passes) → series with pipe

**Before:**
```js
const result = items.filter(x => x.active).map(x => x.name)
// For async: two passes, no error handling
```

**After:**
```js
import { series, pipe } from 'pipelean'
const { results } = await series(items, pipe(
  x => x.active ? x : undefined,  // filter: drop inactive
  x => x.name,                     // transform: extract name
))
```

## Promise.all() → series with collect

**Before:**
```js
// All fail if one fails, or .allSettled for collection
const results = await Promise.all(items.map(fn))
```

**After:**
```js
import { series, collect } from 'pipelean'
const { results, errors } = await series(items, fn, { strategy: collect })
```

## Promise.allSettled() → series with collect

**Before:**
```js
const results = await Promise.allSettled(items.map(fn))
// Must manually unpack {status, value, reason} per item
```

**After:**
```js
import { series, collect } from 'pipelean'
const { results, errors } = await series(items, fn, { strategy: collect })
// Structured result: results and errors already separated
```

## Manual retry logic → retry

**Before:**
```js
async function withRetry(fn, attempts = 3, delayMs = 1000) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn() }
    catch (e) {
      if (i === attempts - 1) throw e
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
}
```

**After:**
```js
import { retry } from 'pipelean'
const robustFn = retry(fn, { attempts: 3, delay: 1000 })
```

## .then().catch() chain → tryCatch

**Before:**
```js
fetch(url)
  .then(res => res.json())
  .catch(e => logError(e))
```

**After:**
```js
import { tryCatch } from 'pipelean'
const safeFetch = tryCatch(fetchJSON, { onError: logError })
```

## ESLint Plugin

Enable the rules to catch these patterns at lint time:

```js
import pipeleanConfig from 'pipelean/eslint/config'

export default [pipeleanConfig];
}]
```
