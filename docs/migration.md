# Migration Guide

How to replace common imperative and error-prone patterns with pipelean equivalents.

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
import pipeleanPlugin from 'pipelean/eslint'
export default [{
  plugins: { pipelean: pipeleanPlugin },
  rules: {
    'pipelean/no-array-foreach': 'warn',
    'pipelean/no-array-reduce': 'warn',
    'pipelean/no-promise-combinators': 'warn',
  },
}]
```
