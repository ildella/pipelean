import {test, expect} from 'vitest'
import {enrichSync} from '$src/index'

test('an async onStepStart is rejected, pointing at enrich', () => {
  const pipeline = enrichSync([() => ({a: 1})], {
    onStepStart: async () => await undefined,
  })

  expect(() => pipeline({seed: 0}))
    .toThrow('enrichSync() onStepStart returned a Promise; use enrich()')
})

test('an async onStepSuccess is rejected, pointing at enrich', () => {
  const pipeline = enrichSync([() => ({a: 1})], {
    onStepSuccess: async () => await undefined,
  })

  expect(() => pipeline({}))
    .toThrow('enrichSync() onStepSuccess returned a Promise; use enrich()')
})

test('the hook rejection is a TypeError', () => {
  const pipeline = enrichSync([() => ({a: 1})], {
    onStepSuccess: async () => await undefined,
  })

  expect(() => pipeline({})).toThrow(TypeError)
})
