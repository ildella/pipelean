# Design Principles & Architecture

## Core motivations

1) do NOT swallow errors and inconsistencies during arrays sync and async operations
2) avoid boilerplate error management (and BAD error management) 

Point number one includes *thrown errors* as well as JavaScript *built-in inconsistencies*: undefined and null.

## Pragmatism Over Purity.

We built this library to be a practical tool for executing tasks.

Our focus is eager execution, not the "Iterator-First" style (lazy, yielding generators) that many functional libraries adopt. For the core operations, eager execution has concrete advantages:

  * Debugging is easier: stack traces are straightforward because work happens immediately.
  * Control is explicit: you find out whether an operation fails right away.
  * Simplicity: no need to understand generators and composition patterns just to run a list of tasks.
     
Our Approach: Eager Execution.

When you run series or scan, the work happens immediately and you get a structured report `{ results, errors, failure }` back. No surprises.

This is a focus, not a rejection of lazy iterators. Pipelean *consumes* async iterables (arrays, generators, anything `for await` can consume) through `series`/`scan`/`reduce`/`filter`. When you need to *build* a lazy producer — for example an async generator that yields pages — pipelean steps aside: write a standard JavaScript generator and let it yield. The `no-loop-without-yield` lint rule encodes exactly this boundary: the only loops pipelean allows are the ones inside a generator that yields.

## Terminology

The vocabulary we have established for the pipelean project: 

  * **Iteration** (Horizontal): The process of traversing a list of items one by one. This is the "width" of the process.
       Implementations: series, scan, filter.
        
  * **Composition** (Vertical): The process of chaining functions together to run sequentially on a single item. This is the "depth" of the process.
       Implementations: pipe, flow.

  * **Fork** (Concurrent fan-out): The process of starting a named set of heterogeneous tasks at the same time and joining their outcomes into one result. This is not a scheduler: no concurrency cap, no cancellation, no ordering guarantee, no process supervision — just I/O concurrency on the same event loop. Every branch starts immediately and completion order never affects the shape of the result. Implementation: join.
   
  * **Operation**: The function passed to an iterator (like series) or to a stateful pipeline (like flow). It can be a simple function or a composed function (pipe).
    - *Transform* (Mapping): An operation that changes the shape or value of an item. (A→B).
    - *Selection* (Filtering): An operation that decides whether to keep or drop an item. (A→A or A→∅). In our merged model, this is signaled by returning undefined.
    - *Patch* (Enrichment): An operation in `flow()` that returns an object shallow-merged into the accumulated state. `{...state, ...patch}`.
  * **Drop Signal**: Returning `undefined` from an operation (mapper in `series`, or any step in `pipe`) signals that the item should be dropped from results. This is how `filter` works internally and how selection-in-pipes works. `undefined` is NOT treated as a valid return value — it is the sentinel for "skip this item." In `flow()`, an operation that has nothing to add must return `{}`, not `undefined`.
  * **Outcome**: The structural result returned by iterators: `{results, errors, sourceErrors, failure}`. `flow()` returns `{value, errors, failure}` — `value` is the final accumulated state, not a results array. `join()` returns `{value, errors, failure}` — `value` maps successful branch names to their values.
