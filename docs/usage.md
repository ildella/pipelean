# Usage

Practicale examples.

## Composition in Action

The power of this library comes from combining these primitives. 

Example: A robust download pipeline 

```js
// 1. Define the "Work"
// pipe: Chains the logic vertically.
const pipeline = pipe(
  processTrack,           // Pure logic
  retry(updateDb, 3),     // Resiliency: Retry DB 3 times
  notifyUI                // Side effect
)

// 2. Execute the "Work"
// series: Runs the pipeline horizontally over the list.
const { results, errors } = await series(tracks, pipeline, {
  strategy: 'collect',    // Don't stop if one track fails
  onProgress: updateBar   // Report global progress
})
```
