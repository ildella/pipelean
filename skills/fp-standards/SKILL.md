# Pipelean FP Standards Skill

Use this skill to enforce Pipelean's pragmatic functional programming standards and architectural principles on any codebase.

## Core Philosophy
1. **No swallowed errors**: Do not swallow errors or inconsistencies (`undefined`, `null`) during array sync/async operations.
2. **Pragmatism over Purity**: We prefer explicit results over lazy iterables. Execution is eager.
3. **No Boilerplate**: Avoid writing repetitive `try/catch` or manual iteration loops. Use `series`, `pipe`, or `scan`.

## Coding Rules
- **No `Array.prototype.forEach`**: ForEach swallows promises and doesn't handle async errors correctly. Use `series` instead.
- **No `Array.prototype.reduce`**: Reduce is often unreadable and mixes state with iteration. Use `scan` for stateful accumulation.
- **Eager Execution**: Do not yield generators or use lazy execution unless strictly required by a specific framework boundary. Get a structured report `{ results, errors, failure }` back immediately.
- **Undefined Short-Circuit**: When composing operations (via `pipe`), returning `undefined` signals dropping the item (selection/filtering).

**Documentation**: Read the full architectural philosophy in [docs/architecture.md](../../docs/architecture.md) (or [online](https://github.com/ildella/pipelean/blob/master/docs/architecture.md)).

