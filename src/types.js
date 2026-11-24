/**
 * The result shapes returned by every managed combinator.
 *
 * One envelope, three keys in the same order: the payload, the handled errors
 * and the failure slot. The payload key names its cardinality — `results` for a
 * run that keeps many values, `value` for a run that keeps one. `failure` is a
 * tagged union, not an opaque object: `false` on success, an error context for
 * `failFast`, an aggregate for `failLate`.
 *
 * @module pipelean/types
 */

/**
 * One input item failed inside the mapper, predicate or scanner.
 *
 * @typedef {object} ItemError
 * @property {*} item The input item that failed.
 * @property {*} error The thrown value.
 * @property {number} index Zero-based position of the item.
 */

/**
 * One step or branch failed inside an `enrich` / `join` run.
 *
 * @typedef {object} OperationError
 * @property {string} operation The step name (`fn.name` or `operation-N`).
 * @property {*} error The thrown value.
 * @property {number} index Zero-based position of the step or branch.
 */

/**
 * The source iterable itself died mid-stream (a generator throwing).
 *
 * @typedef {object} SourceError
 * @property {*} error The thrown value.
 * @property {number} index The position the source had reached.
 */

/**
 * Any error context a managed run can record.
 *
 * @typedef {ItemError|OperationError|SourceError} ErrorContext
 */

/**
 * End-of-run aggregate produced by `failLate`, and by `join`'s `failFast`,
 * which cannot stop branches that already started. For iteration it mixes item
 * and source errors in run order.
 *
 * @typedef {object} AggregateFailure
 * @property {Array<ErrorContext>} errors Every handled error.
 */

/**
 * The `failure` slot of any managed result: `false` when the run did not fail.
 *
 * @typedef {false|ErrorContext|AggregateFailure} Failure
 */

/**
 * `failure` slot of the iterators: an item context, a source context or the
 * `failLate` aggregate. `skip` and `collect` leave it `false`.
 *
 * @typedef {false|ItemError|SourceError|AggregateFailure} IterationFailure
 */

/**
 * `failure` slot of `enrich`: a step context or the `failLate` aggregate. A
 * step fold has no external source, so a source context cannot appear.
 *
 * @typedef {false|OperationError|AggregateFailure} StepFailure
 */

/**
 * `failure` slot of `join`: `failFast` cannot stop branches that already
 * started, so it degrades to `failLate` and only the aggregate can appear.
 *
 * @typedef {false|AggregateFailure} JoinFailure
 */

/**
 * Result of `series`, `filter`, `scan` and their sync twins: every value the
 * run kept, in order.
 *
 * @typedef {object} IterationResult
 * @property {Array<*>} results Mapped values, kept items or every accumulator.
 * @property {Array<ItemError>} errors Handled item errors, in run order.
 * @property {Array<SourceError>} sourceErrors Handled source errors.
 * @property {IterationFailure} failure The run's failure, or `false`.
 */

/**
 * Result of `reduce` and `reduceSync`: the final accumulator only.
 *
 * @typedef {object} ReduceResult
 * @property {*} value The final accumulator. `undefined` is a legal value.
 * @property {Array<ItemError>} errors Handled item errors, in run order.
 * @property {Array<SourceError>} sourceErrors Handled source errors.
 * @property {IterationFailure} failure The run's failure, or `false`.
 */

/**
 * Result of `findSync`: the first matching item.
 *
 * @typedef {object} FindResult
 * @property {*} value The first match, or `undefined` when none matched.
 * @property {Array<ItemError>} errors Handled item errors, in run order.
 * @property {Array<SourceError>} sourceErrors Handled source errors.
 * @property {IterationFailure} failure The run's failure, or `false`.
 */

/**
 * Result of `enrich` and `enrichSync`: the enriched state.
 *
 * @typedef {object} EnrichResult
 * @property {object} value The state after every applied step.
 * @property {Array<OperationError>} errors Handled step errors, in run order.
 * @property {Array<SourceError>} sourceErrors Always empty.
 * @property {StepFailure} failure The run's failure, or `false`.
 */

/**
 * Result of `join`: the record of settled branch values.
 *
 * @typedef {object} JoinResult
 * @property {Record<string, *>} value Values of the successful branches.
 * @property {Array<OperationError>} errors Handled branch errors.
 * @property {Array<SourceError>} sourceErrors Always empty.
 * @property {JoinFailure} failure The run's failure, or `false`.
 */

export {}
