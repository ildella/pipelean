# Architecture

  * `execute (series)` (Iteration): It works *horizontally*. It takes a list of items and applies one transformation to each item in parallel or sequence.
 
  * `pipe / pipeAsync` (Composition): It works *vertically*. 
   - It takes one item and passes it through a chain of functions, one after the other.
   - should *not* handle iterables. I
    execute: Process independent items.

  * `scan` Process dependent items (stateful).