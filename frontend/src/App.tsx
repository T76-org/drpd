import './App.css'
import { FirmwareUploadTestPage } from './features/drpd/FirmwareUploadTestPage'
import { RackView } from './features/rack/RackView'

/**
 * Application root component.
 */
const App = () => {
  const path = typeof window === 'undefined' ? '/' : window.location.pathname
  const content = path === '/firmware-upload' ? <FirmwareUploadTestPage /> : <RackView />

  return (
    <div className="appViewport" data-testid="app-viewport">
      <div className="appContent" data-testid="app-content">
        {content}
      </div>
    </div>
  )
}

export default App
