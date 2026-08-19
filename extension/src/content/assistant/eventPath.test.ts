import { describe, expect, it } from 'vitest'
import { eventPathContains, findEventPathElement } from './eventPath'

describe('Shadow DOM event path helpers', () => {
  it('finds internal controls when the public event target is the shadow host', () => {
    const host = document.createElement('div')
    const root = document.createElement('div')
    const row = document.createElement('div')
    const icon = document.createElement('svg')
    row.className = 'tcba-build-row'
    root.append(row)
    row.append(icon)
    const event = {
      target: host,
      composedPath: () => [icon, row, root, host, document, window],
    } as unknown as Event

    expect(eventPathContains(event, root)).toBe(true)
    expect(findEventPathElement(event, 'tcba-build-row')).toBe(row)
  })

  it('does not treat the shadow host as an internal control without a matching path entry', () => {
    const host = document.createElement('div')
    const root = document.createElement('div')
    const event = {
      target: host,
      composedPath: () => [host, document, window],
    } as unknown as Event

    expect(eventPathContains(event, root)).toBe(false)
    expect(findEventPathElement(event, 'tcba-build-row')).toBeUndefined()
  })
})
