import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DiagnosticConsole, DiagnosticRuntime, diagnosticStyles } from '@tcba/diagnostics'
import { createTeamCityService } from '../teamcity/TeamCityService'
import { BrowserSessionTeamCityTransport } from '../teamcity/TeamCityTransport'
import { App } from './App'
import panelStyles from './AssistantPanel.css?inline'
import navTabStyles from './TeamCityNavTab.css?inline'
import tokenStyles from './tokens.css?inline'

const hostId = 'teamcity-mobile-build-assistant-root'

if (document.getElementById(hostId) === null) {
  const host = document.createElement('div')
  host.id = hostId
  document.documentElement.append(host)

  const shadowRoot = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  const appRoot = document.createElement('div')
  const diagnostics = new DiagnosticRuntime()
  const transport = new BrowserSessionTeamCityTransport(diagnostics.transportObserver)
  const service = diagnostics.decorateService(createTeamCityService(transport))

  style.textContent = [
    tokenStyles,
    navTabStyles,
    panelStyles,
    diagnostics.enabled ? diagnosticStyles : '',
  ].join('\n')
  shadowRoot.append(style, appRoot)
  diagnostics.attachUi(shadowRoot)

  createRoot(appRoot).render(
    <StrictMode>
      <App
        service={service}
        auxiliaryPanel={
          diagnostics.enabled ? <DiagnosticConsole store={diagnostics.store} /> : undefined
        }
      />
    </StrictMode>,
  )
}
