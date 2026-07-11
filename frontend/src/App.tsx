import './App.css'
import { useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { FirmwareUploadTestPage } from './features/drpd/FirmwareUploadTestPage'
import { RackView } from './features/rack/RackView'
import { Dialog, DialogButton } from './ui/overlays'
import initialNotice1Markdown from './content/initialNotice1.md?raw'
import initialNotice2Markdown from './content/initialNotice2.md?raw'
import initialNotice3Markdown from './content/initialNotice3.md?raw'

const INITIAL_NOTICE_SUPPRESSED_STORAGE_KEY = 'drpd:initial-notice-suppressed'
const INITIAL_NOTICE_PAGES = [
  initialNotice1Markdown,
  initialNotice2Markdown,
  initialNotice3Markdown,
]
const INITIAL_NOTICE_MARKDOWN_COMPONENTS: Components = {
  a: ({ node, ...props }) => {
    void node
    return <a {...props} target="_blank" rel="noreferrer" />
  },
}

/** Return whether browser storage says to skip the initial notice. */
const isInitialNoticeSuppressed = (): boolean => {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(INITIAL_NOTICE_SUPPRESSED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Application root component.
 */
const App = () => {
  const path = typeof window === 'undefined' ? '/' : window.location.pathname
  const [isInitialNoticeOpen, setIsInitialNoticeOpen] = useState(
    () => !isInitialNoticeSuppressed(),
  )
  const [suppressInitialNotice, setSuppressInitialNotice] = useState(false)
  const [initialNoticePage, setInitialNoticePage] = useState(0)
  const isLastInitialNoticePage = initialNoticePage === INITIAL_NOTICE_PAGES.length - 1
  const content = path === '/firmware-upload'
    ? <FirmwareUploadTestPage />
    : <RackView startupPairingPromptEnabled={!isInitialNoticeOpen} />

  /** Accept the notice and persist suppression when requested. */
  const acceptInitialNotice = (): void => {
    if (suppressInitialNotice) {
      try {
        window.localStorage.setItem(INITIAL_NOTICE_SUPPRESSED_STORAGE_KEY, 'true')
      } catch {
        // Continue when browser privacy settings make storage unavailable.
      }
    }
    setIsInitialNoticeOpen(false)
  }

  /** Advance the notice or accept it from the final page. */
  const advanceInitialNotice = (): void => {
    if (isLastInitialNoticePage) {
      acceptInitialNotice()
      return
    }
    setInitialNoticePage((page) => page + 1)
  }

  return (
    <div className="appViewport" data-testid="app-viewport">
      <div className="appContent" data-testid="app-content">
        {content}
      </div>
      <Dialog
        open={isInitialNoticeOpen}
        onOpenChange={setIsInitialNoticeOpen}
        title={
          <span className="initialNoticeTitle">
            <span>Before you begin…</span>
            <span>{initialNoticePage + 1} of {INITIAL_NOTICE_PAGES.length}</span>
          </span>
        }
        dismissible={false}
        footer={
          <div className="initialNoticeFooter">
            <label className="initialNoticeCheckbox">
              <input
                type="checkbox"
                checked={suppressInitialNotice}
                onChange={(event) => setSuppressInitialNotice(event.currentTarget.checked)}
              />
              <span>Do not show this again</span>
            </label>
            <div className="initialNoticeButtons">
              <DialogButton
                disabled={initialNoticePage === 0}
                onClick={() => setInitialNoticePage((page) => page - 1)}
              >
                Previous
              </DialogButton>
              <DialogButton variant="primary" onClick={advanceInitialNotice}>
                {isLastInitialNoticePage ? 'OK' : 'Next'}
              </DialogButton>
            </div>
          </div>
        }
      >
        <div className="initialNoticeContent" data-testid="initial-notice-content">
          <ReactMarkdown components={INITIAL_NOTICE_MARKDOWN_COMPONENTS}>
            {INITIAL_NOTICE_PAGES[initialNoticePage]}
          </ReactMarkdown>
        </div>
      </Dialog>
    </div>
  )
}

export default App
