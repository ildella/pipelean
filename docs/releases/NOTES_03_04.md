# Release Notes v0.4.0

## Breaking Changes

### ⚠️ Failure Property Returns `false` Instead of `null`

When no failure occurs, the `failure` property in results now returns `false` instead of `null`.

**Before:**
```javascript
const result = await series(items, fn);
result.failure // null (when successful)
```

**After:**
```javascript
const result = await series(items, fn);
result.failure // false (when successful)
```

This change applies to `series()` and `scan()` functions.

### ⚠️ Removed `scanSeries()`

The `scanSeries()` function has been removed. Use `scan()` with the `series()` pattern instead.

---

## New Features

### New `where()` Predicate Function

A new `where()` utility function for object matching:

```javascript
import { where, filter } from 'pipelean';

const pattern = { status: 'active', role: 'admin' };
const predicate = where(pattern);

// Or use directly with filter
const results = await filter(items, { status: 'active' });
```

---

## Improvements

### Filter Enhancements

- `filter()` now accepts objects as predicates (uses `where()` internally)
- Reimplemented on top of `series()` for better consistency
- Improved null/undefined handling in predicate chains

### Better Series + Pipe Integration

- `pipe()` now properly works within `series()` transformations
- Undefined values in pipe chains are properly short-circuited
- Fixed issues with selection predicates in piped operations

### Documentation Reorganization

- Consolidated error handling guide into main documentation
- Added new `patterns.md` for error strategy patterns
- Improved terminology and examples throughout

### Exported API Cleanup

- Moved experimental code out of main export
- Cleaner public API surface

---

## Dependencies

- Updated ESLint ecosystem
- Bumped `eslint-nostandard` to 0.6
- Updated other development dependencies

---

## Migration Guide

**If you're using `failure === null` checks:**
```javascript
// Change from:
if (result.failure === null) { /* success */ }

// To:
if (result.failure === false) { /* success */ }
// Or simply:
if (!result.failure) { /* success */ }
```

**If you're using `scanSeries()`:**
```javascript
// Use scan() instead:
const result = await scan(items, scanner, initialValue, options);
```

---

For detailed API documentation, see [docs/functional.md](docs/functional.md).
