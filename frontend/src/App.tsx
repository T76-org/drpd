import './App.css'
import { RackView } from './features/rack/RackView'

/**
 * Application root component.
 */
const App = () => {
  return (
    <div className="appViewport" data-testid="app-viewport">
      <div className="appContent" data-testid="app-content">
        <RackView />
      </div>
    </div>
  )
}

export default App
