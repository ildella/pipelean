import {test, expect} from 'vitest'
import {assign, flow} from '$src/functional'

test('assigns property from parse result', async () => {
  const extractName = assign('name', state => state.rawName.trim())

  const {value} = await flow([extractName])({rawName: '  Alice  '})

  expect(value).toEqual({rawName: '  Alice  ', name: 'Alice'})
})

test('skips property when parse returns undefined', async () => {
  const extractTitle = assign(
    'title',
    state => state.rawTitle ? state.rawTitle.trim() : undefined,
  )

  const {value} = await flow([extractTitle])({rawName: 'Bob'})

  expect(value).toEqual({rawName: 'Bob'})
  expect(value).not.toHaveProperty('title')
})

test('works with numeric parse results', async () => {
  const extractYear = assign('year', state => {
    const n = Number.parseFloat(state.rawYear)
    return Number.isNaN(n) ? undefined : n
  })

  const result1 = await flow([extractYear])({rawYear: '1995'})
  expect(result1.value).toEqual({rawYear: '1995', year: 1995})

  const result2 = await flow([extractYear])({rawYear: 'invalid'})
  expect(result2.value).toEqual({rawYear: 'invalid'})
  expect(result2.value).not.toHaveProperty('year')
})

test('works with boolean parse results', async () => {
  const extractActive = assign(
    'active',
    state => state.status === 'active' || undefined,
  )

  const result1 = await flow([extractActive])({status: 'active'})
  expect(result1.value).toEqual({status: 'active', active: true})

  const result2 = await flow([extractActive])({status: 'inactive'})
  expect(result2.value).toEqual({status: 'inactive'})
  expect(result2.value).not.toHaveProperty('active')
})

test('works with object parse results', async () => {
  const extractMeta = assign(
    'meta',
    state => state.rawMeta ? JSON.parse(state.rawMeta) : undefined,
  )

  const result1 = await flow([extractMeta])({rawMeta: '{"key":"val"}'})
  expect(result1.value).toEqual({rawMeta: '{"key":"val"}', meta: {key: 'val'}})

  const result2 = await flow([extractMeta])({})
  expect(result2.value).not.toHaveProperty('meta')
})

test('composes multiple assigns in a flow', async () => {
  const cleanTitle = assign('title', state => state.rawTitle.trim())
  const extractYear = assign('year', state => {
    const n = Number.parseInt(state.rawYear, 10)
    return Number.isNaN(n) ? undefined : n
  })

  const {value} = await flow([cleanTitle, extractYear])({
    rawTitle: '  My Album  ',
    rawYear: '2023',
  })

  expect(value).toEqual({
    rawTitle: '  My Album  ',
    rawYear: '2023',
    title: 'My Album',
    year: 2023,
  })
})

test('composes multiple assigns — some skip, some pass', async () => {
  const cleanTitle = assign('title', state => state.rawTitle.trim())
  const extractYear = assign('year', () => undefined)

  const {value} = await flow([cleanTitle, extractYear])({
    rawTitle: '  Album  ',
    rawYear: 'nope',
  })

  expect(value).toMatchObject({title: 'Album'})
  expect(value).not.toHaveProperty('year')
})

test('undefined is the only skip sentinel — null is assigned', async () => {
  const extractNull = assign('code', () => null)

  const {value} = await flow([extractNull])({})
  expect(value).toEqual({code: null})
})

test('falsy but non-undefined values are assigned', async () => {
  const extractZero = assign('count', state => state.items.length)
  const extractEmpty = assign('tags', state => state.tags)
  const extractFalse = assign('active', () => false)

  const result1 = await flow([extractZero, extractEmpty, extractFalse])({
    items: [],
    tags: [],
  })
  expect(result1.value).toMatchObject({count: 0, tags: [], active: false})
})
