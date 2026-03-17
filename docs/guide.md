# Guide

## Core

We have four distinct tools, separated by the Direction of Data Flow and the State Dependency. 

  1. series (Horizontal / Stateless) 
  2. scan (Horizontal / Stateful) 
  3. filter (Horizontal / Selection) 
  4. pipe (Vertical / Composition) 

## The Function Wrappers

These are "Middleware" for your functions. They wrap a single unit of work to add behavior. 

  * tryCatch (Lifecycle Middleware) 

    What it is: A pipeline of length 1.
    Responsibility: Protection. It isolates a function, handling its lifecycle (onStart, onSuccess, onError, onFinally).
    Use Case:
      Adding local telemetry to a specific step in a pipeline.
      Swallowing errors locally (returning null) while reporting to a monitor.
      Handling "Side Effects" without polluting the main logic.
       
  * retry (Resiliency Middleware) 

    What it is: A specialized version of tryCatch.
    Responsibility: Resiliency. It re-attempts a function if it fails.
    Use Case: Wrapping flaky network calls (e.g., retry(apiCall, { attempts: 3 })).

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
