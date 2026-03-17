# Architecture

  * `execute (series)` (Iteration): 
    - It works *horizontally*. It takes a list of items and applies one transformation to each item in parallel or sequence.
    - Orchestrate the list and report progress."
    - Process independent items.
    - stateless
    - default to collect error strategy
  
  * `scan` (Iteration) 
    - Process dependent items
    - stateful.
    - locked on failFast error strategy 
  
  * `filter`
    - Selects items horizontally.
    - Do not care if items are dependent or not
    - stateless
    - default to collect error strategy
 
  * `pipe / pipeAsync` (Composition): 
    - It works *vertically*. 
   - It takes one item and passes it through a chain of functions, one after the other.
   - should *not* handle iterables. 
   - is just a "Function Builder." It creates a single, composite function f.
   - has no error strategy.
     
  * `tryCatch` is a function wrapper
    - "Protect the work" of the function
    - is effectively a pipeline of length 1.
    - Wraps one function with "Middleware/Lifecycle" (Start, Success, Error, Finally).
    - Can handle progress / error notification even without being run in a series
    - Deep Telemetry: Wrap fn in pipeline to Log specifically when step 2 of a 5-step pipe fails.
    - Can be extended with specific progress/error notifications use-cases
  
  * `retry`: a specialized trycatch
    - Perfect to combine in pipelines

```js
const pipeline = pipe(
  processTrack,       // Standard
  retry(updateDb, 3), // This step gets 3 retries automatically
  notifyUI            // Standard
)
await series(tracks, pipeline)
```
