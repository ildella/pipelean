# Architecture

 * `safeMap` (Iteration): It works *horizontally*. It takes a list of items and applies one transformation to each item in parallel or sequence.
 
 * `pipeAsync` (Composition): It works *vertically*. 
   - It takes one item and passes it through a chain of functions, one after the other.
   - should *not* handle iterables. I