import { describe, it, expect } from 'vitest'
import { compareFigures, extractFigures } from '../../shared/figures.js'

describe('compareFigures', () => {
  it('reports nothing when every figure is preserved', () => {
    const r = compareFigures(
      'ARR grew 42% to ₹12.5 Cr; burn is ₹40 L a month.',
      'ARR rose 42% to ₹12.5 Cr, and monthly burn is ₹40 L.',
    )
    expect(r.added).toEqual([])
    expect(r.missing).toEqual([])
    expect(r.total).toBe(3)
  })

  it('treats grouping and trailing zeros as formatting, not a change', () => {
    expect(compareFigures('Raised ₹5,00,000', 'Raised ₹500,000')).toMatchObject({ added: [], missing: [] })
    expect(compareFigures('Valuation of 5.0 Cr', 'Valuation of 5 Cr')).toMatchObject({ added: [], missing: [] })
    expect(compareFigures('Rs. 5 crore', '₹5 Cr')).toMatchObject({ added: [], missing: [] })
  })

  it('flags an altered amount as both added and missing', () => {
    const r = compareFigures('Round size is ₹5 Cr.', 'Round size is ₹50 Cr.')
    expect(r.added).toEqual(['₹50 Cr'])
    expect(r.missing).toEqual(['₹5 Cr'])
  })

  it('flags a changed currency', () => {
    const r = compareFigures('Raised $5M', 'Raised ₹5M')
    expect(r.added).toEqual(['₹5M'])
    expect(r.missing).toEqual(['$5M'])
  })

  it('flags a changed percentage', () => {
    const r = compareFigures('Gross margin of 12.5%', 'Gross margin of 12%')
    expect(r.added).toEqual(['12%'])
    expect(r.missing).toEqual(['12.5%'])
  })

  it('reports dropped figures as missing only', () => {
    const r = compareFigures('MRR is 8 lakh and churn is 3%.', 'MRR is 8 lakh.')
    expect(r.added).toEqual([])
    expect(r.missing).toEqual(['3%'])
  })

  it('does not read a following word as a unit', () => {
    expect(extractFigures('5 months and 5 large teams').map((f) => f.key)).toEqual(['5', '5'])
  })

  it('ignores numbered-list markers', () => {
    const r = compareFigures('Churn is 3%.', '1. What drove churn of 3%?\n2. How does that compare to peers?')
    expect(r.added).toEqual([])
  })

  it('finds nothing in text without numbers', () => {
    expect(compareFigures('hello there', 'Hello there.')).toEqual({ added: [], missing: [], total: 0 })
  })
})
