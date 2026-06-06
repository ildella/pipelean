## Some real world examples

The power of this library comes from combining these primitives. 

#### Example: A robust download pipeline

```js
const pipeline = pipe(
  retry(downloadTrack, 3), // Resiliency: Retry 3 times
  processTrack,            // Pure logic
  retry(updateDb, 3),      // Resiliency: Retry DB 2 times
  notifyUI                 // Side effect
)

const { results, errors } = await series(tracks, pipeline, {
  strategy: 'collect',    // Don't stop if one track fails
  onProgress: updateBar   // Report global progress
})
```

#### Example: scan (Stateful Dependency)

Scenario: You are adding tracks to a playlist on a media renderer (like Sonos or UPnP). The API requires you to specify the ID of the previous track to insert the new one after it. This creates a dependency chain: Track B cannot be added until Track A is finished and returns its ID. 
javascript
 
```js
import { scan } from 'pipelean'

// The function needs the result of the previous step (lastId)
const insertTrackAfter = async (track, previousId) => {
  const newId = await mediaRenderer.insert(track, { after: previousId })
  return newId // This becomes the 'previousId' for the next item
}

// scan passes the accumulator (acc) to the next iteration
const { results, failure } = await scan(
  playlistTracks,
  (acc, track) => insertTrackAfter(track, acc),
  0 // Initial ID (e.g., 0 or 'start')
)

// If Track 2 fails, execution stops immediately (Fail Fast).
// 'failure' contains the track that broke the chain.
// 'results' is empty — no partial results on failure.
```

Why not series?

Series runs items independently. It cannot pass the ID from Track 1 to Track 2. scan is required when Step N depends on the output of Step N-1.

#### Example: reduce (Pure Reduction)

Scenario: You need a simple sum of track durations. With `scan` you'd have to fish the last value out of the intermediate results array. `reduce` gives you the final value directly.

```js
import { reduce } from 'pipelean'

// Before: clunky, error-prone
const {results: durations} = await scan(
  tracks,
  (acc, {duration}) => acc + duration,
  0,
)
const totalDuration = durations.at(-1) || 0

// After: clean, direct
const {value: totalDuration} = await reduce(
  tracks,
  (acc, {duration}) => acc + duration,
  0,
)
// totalDuration = 22 — no .at(-1), no fallback
```

#### Example: tryCatch as an App-Layer Primitive

Scenario: You want a reusable "Error Boundary" for your application that automatically logs errors to a monitoring service (like Sentry) and pushes a notification to your UI state (e.g., a Svelte store), ensuring the app never crashes silently. 

```js
import { tryCatch } from 'pipelean'
import { captureException } from './telemetry' // e.g. Sentry
import { appErrorQueue } from './state'        // e.g. Svelte store

export const withErrorBoundary = (fn, { context = 'Unnamed' } = {}) =>
  tryCatch(fn, {
    onError: (error) => {
      // 1. Log to external monitoring
      captureException(error, { tags: { context } })
      
      // 2. Push to UI for user notification (Toast/Banner)
      appErrorQueue.update(queue => [...queue, { 
        message: `${context} failed: ${error.message}` 
      }])
    }
  })

// Usage in your app layer
const saveSettings = withErrorBoundary(
  async (settings) => { 
    await api.post('/settings', settings) 
  },
  { context: 'Save Settings' }
)

// Even if api.post throws, the app won't crash. 
// The error is logged and the UI is notified.
await saveSettings(newSettings)
```

#### Example: flow (Stateful Accumulation Across One Input)

Scenario: You have a raw album payload and want to derive `title`, `year`, and `artists` from it through a series of enrichment steps. Each step receives the **current accumulated state** and returns an **object patch** that gets shallow-merged in. The pipeline is defined once and reused with different inputs.

```js
import { flow } from 'pipelean'

const prepareAlbum = state => ({
  title: state.rawTitle.trim(),
})

const extractYear = state => ({
  year: parseYear(state.rawYear),
})

const extractArtists = state => ({
  artists: state.artists ?? [],
})

// 1) Define the pipeline once
const processAlbum = flow([
  prepareAlbum,
  extractYear,
  extractArtists,
])

// 2) Run the same pipeline with different inputs
const a = await processAlbum({rawTitle: '  Kind of Blue  ', rawYear: 1959})
// a.value = {title: 'Kind of Blue', year: 1959, artists: []}

const b = await processAlbum({rawTitle: '  Blue Train  ', rawYear: 1958, artists: ['Coltrane']})
// b.value = {title: 'Blue Train', year: 1958, artists: ['Coltrane']}
```

Why not `pipe()`?

`pipe()` chains value-in / value-out. Each step transforms the previous step's return value. `flow()` chains state-patch-in / state-patch-out and accumulates state. With `flow()`, every step sees the full state built so far, and the result is structured: `{value, errors, failure}` — no need to thread a state object manually.

#### Example: flow with failFast + onFailure telemetry

Scenario: Some enrichment steps are critical (e.g., extracting the year from a date is required for cataloging). Stop the pipeline on first failure, but still notify the app layer through `onFailure`.

```js
import { flow, failFast } from 'pipelean'

const processAlbum = flow(
  [prepareAlbum, extractYear, extractArtists],
  {strategy: failFast, onFailure: ({operation, error, index}) => {
    reportEnrichmentError({step: operation, error, index})
  }},
)

const {value, errors, failure} = await processAlbum(input)
// failure is {operation, error, index} when extractYear (or any step) throws
// value is the last successful accumulated state — still useful for partial progress
```

The error shape is normalized: `operation` is the function's `name` (e.g., `extractYear`) or `operation-${index}` for anonymous functions. `index` is the position in the pipeline. This makes error reports readable without writing string labels in the app layer.

#### Example: flow with collect + onError per-step logging

Scenario: You want best-effort enrichment. If a step fails (e.g., `extractArtists` cannot parse the artists list), log it and continue.

```js
import { flow, collect } from 'pipelean'

const processAlbum = flow(
  [prepareAlbum, extractYear, extractArtists],
  {
    strategy: collect,
    onError: ({operation, error, index, total}) => {
      logger.warn({step: operation, index, total, error: error.message})
    },
  },
)

const {value, errors, failure} = await processAlbum(input)
// value contains everything that succeeded (e.g., title and year)
// errors lists each failed step
// failure is false — we made it to the end
```

#### Example: flowSync for synchronous enrichment

Scenario: All your enrichment steps are pure synchronous functions (no I/O, no async dependencies). Use `flowSync` to avoid the `Promise` overhead and the `await` at the call site.

```js
import { flowSync } from 'pipelean'

const processAlbumSync = flowSync([
  state => ({title: state.rawTitle.trim()}),
  state => ({year: Number(state.rawYear)}),
  state => ({slug: `${state.year}-${state.title.toLowerCase().replace(/\s+/g, '-')}`}),
])

const {value} = processAlbumSync(rawAlbum)
// value: {title, year, slug, rawTitle, rawYear}
```

`flowSync` returns `{value, errors, failure}` directly. Same strategies, same `onError` / `onFailure` semantics, same normalized error shapes as `flow()`. Use it whenever all your data and operations are synchronous.
