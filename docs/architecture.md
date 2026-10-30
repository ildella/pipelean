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

When you run `series`, `scan`, `reduce` or `enrich`, the work happens immediately and you get a structured report back. No surprises.

This is a focus, not a rejection of lazy iterators. Pipelean *consumes* async iterables (arrays, generators, anything `for await` can consume) through `series`/`scan`/`reduce`/`filter`; `enrich` and `pipe` work on one value at a time. When you need to *build* a lazy producer — for example an async generator that yields pages — pipelean steps aside: write a standard JavaScript generator and let it yield. The `no-loop-without-yield` lint rule encodes exactly this boundary: the only loops pipelean allows are the ones inside a generator that yields. `stopWhen` follows the same rule: it is a tiny yielding adapter (a producer, not an iterator), shipped because every consumer needed the same five lines of stop logic.

## Terminology

The vocabulary we have established for the pipelean project: 

  * **Iteration** (Horizontal): The process of traversing a list of items one by one. This is the "width" of the process.
       Implementations: series, scan, filter.
        
  * **Composition** (Vertical): The process of chaining functions together to run sequentially on a single item. This is the "depth" of the process. Value in, value out; nothing is merged.
       Implementation: pipe.

  * **Fold** (Vertical, accumulating): The process of folding a collection into an accumulator. Two collections are possible: the *items* (many inputs, each step depends on the previous one) and the *steps* (one input, many enrichments).
       Implementations: scan (items, every intermediate), reduce (items, final value only), enrich (steps, final value only).
       
       `scan` and `reduce` are one engine with two result shapes. `enrich` is the same fold where the collection is the operations array:
       `enrich(ops)(input) === reduce(ops, (state, op) => ({...state, ...op(state)}), input)`.

  * **Recovery** (Fold-local seam): The `recover` option on `scan` / `reduce`. When the scanner throws, it receives `{error, item, index, state, total?}` — `state` is the accumulator before the failed item — and returns the next accumulator. A recovered error is consumed (no `errors` entry, `failure` stays false); if `recover` throws, the thrown error becomes the item error and the normal strategy applies. It is not a strategy: strategies still own the no-recovery path and the end-of-run outcome, source errors bypass it, and it exists only where there is an accumulator to recover into.

  * **Fork** (Concurrent fan-out): The process of starting a named set of heterogeneous tasks at the same time and joining their outcomes into one result. This is not a scheduler: no concurrency cap, no cancellation, no ordering guarantee, no process supervision — just I/O concurrency on the same event loop. Every branch starts immediately and completion order never affects the shape of the result. Implementation: join.
   
  * **Operation**: The function passed to an iterator (like series) or to a fold over steps (enrich). It can be a simple function or a composed function (pipe).
    - *Transform* (Mapping): An operation that changes the shape or value of an item. (A→B).
    - *Selection* (Filtering): An operation that decides whether to keep or drop an item. (A→A or A→∅). In our merged model, this is signaled by returning undefined.
    - *Patch* (Enrichment): An operation in `enrich()` that returns an object shallow-merged into the accumulated state. `{...state, ...patch}`.
  * **Drop Signal**: Returning `undefined` from an operation (mapper in `series`, or any step in `pipe`) signals that the item should be dropped from results. This is how `filter` works internally and how selection-in-pipes works. `undefined` is NOT treated as a valid return value — it is the sentinel for "skip this item." In `enrich()`, an operation that has nothing to add must return `{}`, not `undefined`.
  * **Outcome**: The structural result returned by iterators: `{results, errors, sourceErrors, failure}`. `enrich()` returns `{value, errors, failure}` — `value` is the final accumulated state, not a results array. `join()` returns `{value, errors, failure}` — `value` maps successful branch names to their values. `assertOk(outcome)` is the guard for callers that would otherwise ignore a truthy `failure`: it returns the same outcome, or throws with the original error as `cause`.
