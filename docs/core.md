# Guide

## Core

We have four distinct tools, separated by the Direction of Data Flow and the State Dependency. 

1. series (Horizontal / Stateless) 

     What it does: Iterates over a List of Items. Applies a transformation horizontally.
     Data Flow: Item A → 
     Result A. Item B 
    → 
     Result B. (Independent).
     State: Stateless. Item B does not know about Item A.
     Error Strategy: Default is collect. (Gathers errors, keeps processing).
     Responsibility: Orchestration. It manages the loop, handles the strategy, and reports progress (onProgress).
     

2. scan (Horizontal / Stateful) 

     What it does: Iterates over a List of Items, accumulating state.
     Data Flow: Item B depends on the result of Item A.
     State: Stateful. Passes an accumulator forward.
     Error Strategy: Hardcoded to failFast. (If Item A fails, Item B cannot run).
     Responsibility: Reduction and Aggregation.
     

3. filter (Horizontal / Selection) 

     What it does: Iterates over a List of Items. Selects a subset.
     Data Flow: Item → 
     Predicate 
    → 
     Keep or Discard.
     State: Stateless.
     Error Strategy: Default is collect.
     

4. pipe (Vertical / Composition) 

     What it does: Composes a List of Functions. Chains logic vertically.
     Data Flow: Input → 
     Step 1 
    → 
     Step 2 
    → 
     Output.
     Error Strategy: None. It is "dumb." It simply builds a single composite function. If a step throws, the pipe throws.
     Responsibility: Logic composition.
     

## The Function Wrappers

These are "Middleware" for your functions. They wrap a single unit of work to add behavior. 

5. tryCatch (Lifecycle Middleware) 

  What it is: A pipeline of length 1.
  Responsibility: Protection. It isolates a function, handling its lifecycle (onStart, onSuccess, onError, onFinally).
  Use Case:
    Adding local telemetry to a specific step in a pipeline.
    Swallowing errors locally (returning null) while reporting to a monitor.
    Handling "Side Effects" without polluting the main logic.
     
6. retry (Resiliency Middleware) 

  What it is: A specialized version of tryCatch.
  Responsibility: Resiliency. It re-attempts a function if it fails.
  Use Case: Wrapping flaky network calls (e.g., retry(apiCall, { attempts: 3 })).
