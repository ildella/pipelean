# Design Principles & Architecture

Pragmatism Over Purity.

We built this library to be a practical tool for executing tasks.

Many functional libraries are "Iterator-First" (lazy, yielding generators). We explicitly rejected that approach. Why? 

  * Debugging is harder: Lazy execution makes stack traces difficult to read.
  * Control is deferred: You don't know if an operation fails until you consume the iterator.
  * Complexity: It requires users to understand generators and composition patterns just to run a simple list of tasks.
     
Our Approach: Eager Execution.

We prefer Explicit Results over Lazy Iterables. When you run series or scan, the work happens immediately. You get a structured report { results, errors, failure } back. No surprises.
