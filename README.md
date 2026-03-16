# Pipelean

Async-first, error-aware data transformation library. Never write a for loop again.

---

## Core Concepts

### Error Strategies

Three strategies control how errors are handled across all operations: `failFast` (default, stops immediately), `skip` (continues, collects errors), `collect` (continues, yields error objects). Every operation accepts `{onError: strategy}` in its options.

### Operations vs Pipelines

  * **Operations** (`safeMap`, `safeFilter`) transform individual items; they accept immediate or curried arguments. 
  * **Pipelines** (`safePipe`, `safeAsyncIterator`) compose operations and manage error propagation across steps.

### Map, Filter, Scan, Batch — What's the Difference?

  * `safeMap` transforms each item (sync or async)
  * `safeFilter` keeps items matching a predicate
  * `scanSeries` accumulates a value while iterating
  * `mapSeries` maps with a concurrency limit. 

The all return `{results, errors, failure}` for error handling.

### Error Strategies Are Consistent

Every *operation* and every *pipeline* defaults to `failFast`: stop on first error. Use `{onError: skip}` to continue past errors, or `{onError: collect}` to gather them. Same semantics everywhere — no surprises.

---

## Operations

### safeMap

```js
// Immediate: array input, transform, options
const {results, errors, failure} = await safeMap(data, x => x * 2, {onError: skip})

// Curried: for use in pipelines
const double = safeMap(x => x * 2)
const pipeline = safePipe(double, ...)
```

Async transforms supported. Default: `failFast`. Returns `{results, errors, failure}`.

### safeFilter

```js
// Immediate
const {results, errors, failure} = await safeFilter(data, x => x > 5, {onError: collect})

// Curried
const bigOnly = safeFilter(x => x > 5)
```

Predicate can be async. Default: `failFast`. Same return structure.

### mapSeries

```js
const results = await mapSeries(data, async item => fetchData(item), {limit: 5})
```

Maps with optional concurrency limit. No error strategies — throws on failure. Use for simple async mapping.

### scanSeries

```js
const runningTotal = await scanSeries(data, (acc, item) => acc + item, 0)
// Returns: [1, 3, 6, 10, ...]
```

Accumulates a value while iterating. Returns all intermediate results.

---

## Pipelines

### safePipe

```js
const {results, errors, failure} = await safePipe(
  safeMap(x => x * 2),
  safeFilter(x => x > 5),
  safeMap(async x => enrichData(x))
)(data)
```

Chains operations with error propagation. Each step's errors accumulate; `failFast` in any step stops the entire pipeline. Returns structured result.

### safeAsyncIterator

```js
async function* enrichStream(source) {
  const iterator = safeAsyncIterator(source, async item => ({...item, meta: await fetch(item.id)}), {onError: collect})
  for await (const result of iterator) {
    yield result
  }
}
```

Generator-based iteration. Lazy evaluation stops when you stop consuming. Default: `failFast`. Perfect for streaming large datasets.

---

## Example: Full Pipeline

```js
const data = [1, 2, 3, 4, 5]

const {results, errors, failure} = await safePipe(
  safeMap(x => x * 2, {onError: skip}),          // double
  safeFilter(x => x > 4, {onError: skip}),       // keep > 4
  safeMap(async x => ({value: x, enriched: await fetchMeta(x)}), {onError: collect})
)(data)

// results: transformed data
// errors: accumulated errors from all steps
// failure: first failFast error (null if no failFast errors)
```

---

## tryCatch

Wraps a function with hooks for start, success, error, finally. Not part of error strategies — use for side effects (logging, cleanup). For error handling in pipelines, use operations' `onError` option.

```js
const wrapped = tryCatch(asyncFn, {
  onStart: () => console.log('starting'),
  onSuccess: (result) => console.log('done', result),
  onError: (error) => console.error(error),
  onFinally: () => cleanup()
})

const result = await wrapped(args)
```

---

## When to Use What

**Need simple data transformation?** Start with `safeMap` + `safeFilter` in a `safePipe`.

**Processing streams or large datasets?** Use `safeAsyncIterator` for lazy, memory-efficient iteration.

**Mapping with concurrency limits?** Use `mapSeries`.
