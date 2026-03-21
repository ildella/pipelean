# Error Handling in Pipelean

Pipelean provides comprehensive error handling through named strategies and callbacks.

## Error Strategies

All iteration functions (`series`, `filter`, `scan`) support four error strategies:

All three iteration functions (series, filter, scan) consistently implement:

**failFast:** (aliases: `fail`, `stopOnError`)
- Sets `failure: {item, error}` on first error
- Calls `onFailure({item, error})` immediately
- Stops iteration

**failLate:**
- Collects all errors in `errors` array
- Sets `failure: true` after loop completes (only if `errors.length > 0`)
- Calls `onFailure(true)` if `failure` is truthy

**collect:**
- Collects all errors in `errors` array
- Sets `failure: null`
- Does NOT call `onFailure`

**skip:**
- Ignores errors (no collection, `errors` stays empty)
- Sets `failure: null`
- Does NOT call `onFailure`

---

### `failFast` (default for `scan`)

Stop immediately on first error.

**Aliases:** `fail`, `stopOnError`

**Returns:** `{results, errors: [], failure: {item, error}}`

```javascript
import {series, failFast} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2) throw new Error('Error')
  return item * 2
}, {strategy: failFast})

// result = {results: [2], errors: [], failure: {item: 2, error: Error(...)}}
```

**Use when:** Critical operations where failure means entire pipeline is invalid.

---

### `collect` (default for `series` and `filter`)

Continue through all items, collect errors.

**Returns:** `{results, errors: [...], failure: null}`

```javascript
import {series, collect} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2 || item === 4) throw new Error('Error')
  return item * 2
}, {strategy: collect})

// result = {results: [2, 6], errors: [{item: 2, error: ...}, {item: 4, error: ...}], failure: null}
```

**Use when:** Batch operations, logging scenarios, background tasks.

---

### `failLate`

Continue through all items like `collect`, but return `failure: true` at the end.

**Returns:** `{results, errors: [...], failure: true}` (if any errors occurred)

```javascript
import {series, failLate} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2 || item === 4) throw new Error('Error')
  return item * 2
}, {strategy: failLate})

// result = {results: [2, 6], errors: [{item: 2, error: ...}, {item: 4, error: ...}], failure: true}
```

**Use when:** Application-layer needs to detect if *any* error occurred.

---

### `skip`

Ignore errors entirely (no collection), but `onError` is still called if present.

**Returns:** `{results, errors: [], failure: null}`

```javascript
import {series, skip} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2) throw new Error('Error')
  return item * 2
}, {strategy: skip})

// result = {results: [2, 6], errors: [], failure: null}
```

**Use when:** Best-effort processing, some failures are acceptable.

---

## Callbacks

### `onError`

Optional callback for verification/telemetry (logging, metrics).

- Called for **every** error
- Does NOT affect control flow
- Use for: logging, metrics, external error reporting

```javascript
await series(items, fn, {
  strategy: skip,
  onError: (error) => console.error('Error:', error.message) // Called for each error
})
```

---

### `onFailure`

Optional callback for application-layer error handling (UI updates, notifications).

- Called when `failure` is truthy
- Depends on strategy:
  - `failFast`: called with `{item, error}`
  - `failLate`: called with `true`
  - `collect` / `skip`: NOT called (failure is null)

```javascript
await series(items, fn, {
  strategy: failFast,
  onFailure: (failure) => {
    if (failure === true) {
      // failLate: show general error notification
      showToast('Some items failed')
    } else {
      // failFast: show specific error with item
      showToast(`Item ${failure.item} failed: ${failure.error.message}`)
    }
  }
})
```

---

## Usage Patterns

### Pattern 1: Logging + Detection (`collect` + `onError`)

```javascript
await series(items, fn, {
  strategy: collect,
  onError: (error) => logger.error(error)
})
// Check failure manually: if (result.errors.length > 0) { ... }
```

### Pattern 2: Best-effort + Monitoring (`skip` + `onError`)

```javascript
await series(items, fn, {
  strategy: skip,
  onError: (error) => metrics.increment('errors')
})
// Result has no errors array, failure is null
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
    if (failure === true) {
      showToast('Some items failed')
    } else {
      showToast(`Error: ${failure.error.message}`)
    }
    if (opts.onFailure) opts.onFailure(failure)
  }
})

await series(items, fn, withErrorHandling({strategy: failFast}))
```

---

## Key Principles

1. **`onError` ≠ error strategy**: `onError` is a callback, not a strategy
2. **`failure` is truthy for**: `failFast` ({item, error}) and `failLate` (true)
3. **`failure` is null for**: `collect` and `skip`
4. **Strategy selection**: Choose based on whether failures are acceptable

---

## Further Reading

- **Examples:** See `tests/onFailure.test.js` and `tests/error-strategies.test.js`
- **Reference:** See `docs/functional.md` for function signatures
- **Guide:** See `docs/guide.md` for high-level patterns
