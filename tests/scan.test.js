import {test, expect} from 'vitest'
import {scan} from '$src/functional'

test('threads accumulator through items', async () => {
  const {results} = await scan(
    [1, 2, 3],
    (acc, item) => Promise.resolve(acc + item),
    0,
  )
  expect(results).toEqual([1, 3, 6])
})

test('returns intermediate results', async () => {
  const {results} = await scan(
    ['a', 'b', 'c'],
    (acc, item) => Promise.resolve(acc + item),
    '',
  )
  expect(results).toEqual(['a', 'ab', 'abc'])
})

test('works with async scanner', async () => {
  const {results} = await scan(
    [10, 20],
    async (acc, item) => {
      await new Promise(resolve => setTimeout(resolve, 1))
      return acc + item
    },
    0,
  )
  expect(results).toEqual([10, 30])
})
