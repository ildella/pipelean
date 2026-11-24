import {assertUnsupportedOptions} from './shared.js'
import {LIFECYCLE_OPTIONS} from './run.js'

/**
 * Validate the options of an enrichment pipeline.
 *
 * `enrich` folds its steps in memory: it never pulls a source, so the run
 * lifecycle (`signal`, `pause`, `take`, `onProgress`, …) cannot apply and is
 * rejected rather than forwarded to the internal fold. `recover` keeps its own
 * message: it is a fold feature that would change the shape of the pipeline.
 */
export const assertEnrichOptions = (opts, label) => {
  if (opts.recover !== undefined)
    throw new TypeError(
      `${label} does not support recover; use reduce if fold recovery is ` +
      'needed',
    )

  assertUnsupportedOptions(opts, LIFECYCLE_OPTIONS, label)
}
