import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DiagnosticConsole } from './DiagnosticConsole'
import { DiagnosticEventStore } from './DiagnosticEventStore'

afterEach(cleanup)

describe('DiagnosticConsole', () => {
  it('reveals the full API URL and response body on demand', async () => {
    const store = new DiagnosticEventStore(true)
    const responseUrl =
      'https://teamcity.example.test/app/rest/builds/id:700/artifacts?locator=recursive'
    store.emit(
      'TeamCity',
      'success',
      '← HTTP 200: synthetic artifact listing',
      {
        kind: 'response',
        url: responseUrl,
        status: 200,
        contentType: 'application/json',
        bodyText: '{"file":[{"name":"synthetic.apk"}]}',
      },
    )

    render(<DiagnosticConsole store={store} />)
    fireEvent.click(screen.getByText('Полный API URL и response'))

    expect(await screen.findByText(responseUrl)).toBeInTheDocument()
    expect(screen.getByText('{"file":[{"name":"synthetic.apk"}]}')).toBeInTheDocument()
  })

  it('does not retain events when disabled', () => {
    const store = new DiagnosticEventStore(false)

    store.emit('UI', 'info', 'Synthetic event.')

    expect(store.getSnapshot()).toEqual([])
  })
})
