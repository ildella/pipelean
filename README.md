# Pipelean

A pragmatic library for sequential async operations with robust error handling.

Why?

Standard Promise.all crashes on the first error. Promise.allSettled gives you a messy array of statuses. Pipelean gives you structured results, error strategies, and flow control out of the box.

## The Concept

    pipe: Compose functions vertically.
    series: Execute them horizontally over a list.

## Quick Example

import { pipe, series, retry } from 'pipelean';// 1. Build your workflowconst pipeline = pipe(  processData,  retry(saveToDb, { attempts: 3 }), // Built-in resiliency  notifyUI);// 2. Execute safelyconst { results, errors } = await series(items, pipeline);// results: Successful items// errors:  [{ item, error }, ...] -> Structured failures

 
## Documentation

  * [Architecture](docs/architecture.md) : The philosophy and design principles.
  * [Guide](docs/guide.md) : Core concepts and usage patterns.
  <!-- * [API Reference](docs/api.md) : Detailed feature sets. -->
