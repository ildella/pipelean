import {describe, it, expect} from 'vitest'
import {greet} from '$src/greet'

test('It works!', () => {
  expect('a').toHaveLength(1)
})

describe('greet', () => {
  it('returns a greeting string', () => {
    expect(greet('world')).toBe('Hello, world')
  })
})
