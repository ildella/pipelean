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
// 'results' contains IDs of successfully added tracks.
// 'failure' contains the track that broke the chain.
```

Why not series?

Series runs items independently. It cannot pass the ID from Track 1 to Track 2. scan is required when Step N depends on the output of Step N-1.

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
