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
  * retry (Resiliency Middleware) 

## Composition in Action

The power of this library comes from combining these primitives. 

Example: A robust download pipeline 

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
