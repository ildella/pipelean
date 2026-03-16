import {test, expect} from 'vitest'
import {mapSeries} from '$lib/functional'

test('processes items sequentially and returns results', async () => {
  const order = []
  const results = await mapSeries([1, 2, 3], item => {
    order.push(item)
    return Promise.resolve(item * 2)
  })
  expect(results).toEqual([2, 4, 6])
  expect(order).toEqual([1, 2, 3])
})

test('respects limit option', async () => {
  const results = await mapSeries(
    [1, 2, 3, 4, 5],
    item => Promise.resolve(item * 10),
    {limit: 3},
  )
  expect(results).toEqual([10, 20, 30])
})

test('returns empty array for empty input', async () => {
  await expect(
    mapSeries([], item => Promise.resolve(item)),
  ).resolves.toEqual([])
})
