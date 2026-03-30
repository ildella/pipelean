# Design Principles & Architecture

## Core motivations

1) do NOT swallow errors and inconsistencies during arrays sync and async operations
2) avoid boilerplate error management (and BAD error management) 

Point number one includes *thrown errors* as well as JavaScript *built-in inconsistencies*: undefined and null.

## Pragmatism Over Purity.

We built this library to be a practical tool for executing tasks.

Many functional libraries are "Iterator-First" (lazy, yielding generators). We explicitly rejected that approach. Why? 

  * Debugging is harder: Lazy execution makes stack traces difficult to read.
  * Control is deferred: You don't know if an operation fails until you consume the iterator.
  * Complexity: It requires users to understand generators and composition patterns just to run a simple list of tasks.
     
Our Approach: Eager Execution.

We prefer Explicit Results over Lazy Iterables. When you run series or scan, the work happens immediately. You get a structured report { results, errors, failure } back. No surprises.

## Terminology

The vocabulary we have established for the pipelean project: 

  * **Iteration** (Horizontal): The process of traversing a list of items one by one. This is the "width" of the process.
       Implementations: series, scan, filter.
       
  * **Composition** (Vertical): The process of chaining functions together to run sequentially on a single item. This is the "depth" of the process.
       Implementation: pipe.
       
  * **Operation**: The function passed to an iterator (like series). It can be a simple function or a composed function (pipe).
    - *Transform* (Mapping): An operation that changes the shape or value of an item. (A→B).
    - *Selection* (Filtering): An operation that decides whether to keep or drop an item. (A→A or A→∅). In our merged model, this is signaled by returning undefined.
  * **Outcome**: The structural result returned by iterators: {results, errors, failure}.
