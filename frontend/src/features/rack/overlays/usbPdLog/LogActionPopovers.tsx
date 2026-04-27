import styles from '../../instruments/DrpdUsbPdLogInstrumentView.module.css'

export const MessageLogExportPopover = ({
  exportError,
  hasSelection,
  isExporting,
  onExportJson,
  onExportCsv,
}: {
  exportError: string | null
  hasSelection: boolean
  isExporting: boolean
  onExportJson: () => void
  onExportCsv: () => void
}) => (
  <div className={styles.headerPopup}>
    {exportError ? (
      <p className={styles.headerPopupError}>{exportError}</p>
    ) : null}
    <div className={styles.headerPopupActions}>
      <button
        type="button"
        className={styles.headerPopupButton}
        disabled={!hasSelection || isExporting}
        onClick={onExportJson}
      >
        Export JSON
      </button>
      <button
        type="button"
        className={styles.headerPopupButton}
        disabled={!hasSelection || isExporting}
        onClick={onExportCsv}
      >
        Export CSV
      </button>
    </div>
  </div>
)

export const MessageLogClearPopover = ({
  clearError,
  isClearing,
  onCancel,
  onClear,
}: {
  clearError: string | null
  isClearing: boolean
  onCancel: () => void
  onClear: () => void
}) => (
  <div className={styles.headerPopup}>
    <p className={styles.headerPopupText}>
      This will permanently delete all logged messages and analog samples, and clear the time strip.
      Are you sure?
    </p>
    {clearError ? (
      <p className={styles.headerPopupError}>{clearError}</p>
    ) : null}
    <div className={styles.headerPopupActions}>
      <button
        type="button"
        className={styles.headerPopupButton}
        onClick={onCancel}
        disabled={isClearing}
      >
        Cancel
      </button>
      <button
        type="button"
        className={`${styles.headerPopupButton} ${styles.headerPopupButtonDanger}`}
        onClick={onClear}
        disabled={isClearing}
      >
        {isClearing ? 'Clearing...' : 'Clear'}
      </button>
    </div>
  </div>
)

export const MessageLogConfigurePopover = ({
  instrumentId,
  minBuffer,
  maxBuffer,
  bufferInput,
  bufferError,
  isApplyingBuffer,
  setBufferInput,
  setBufferError,
  onCancel,
  onApply,
}: {
  instrumentId: string
  minBuffer: number
  maxBuffer: number
  bufferInput: string
  bufferError: string | null
  isApplyingBuffer: boolean
  setBufferInput: (value: string) => void
  setBufferError: (value: string | null) => void
  onCancel: () => void
  onApply: () => void
}) => (
  <div className={styles.headerPopup}>
    <div className={styles.headerPopupFieldRow}>
      <label className={styles.headerPopupLabel} htmlFor={`${instrumentId}-max-buffer`}>
        Message buffer size
      </label>
      <input
        id={`${instrumentId}-max-buffer`}
        className={styles.headerPopupInput}
        aria-label="Max message buffer"
        type="number"
        min={minBuffer}
        max={maxBuffer}
        step={1}
        value={bufferInput}
        onChange={(event) => {
          setBufferInput(event.currentTarget.value)
          setBufferError(null)
        }}
        disabled={isApplyingBuffer}
      />
    </div>
    {bufferError ? (
      <p className={styles.headerPopupError}>{bufferError}</p>
    ) : null}
    <div className={styles.headerPopupActions}>
      <button
        type="button"
        className={styles.headerPopupButton}
        onClick={onCancel}
        disabled={isApplyingBuffer}
      >
        Cancel
      </button>
      <button
        type="button"
        className={styles.headerPopupButton}
        onClick={onApply}
        disabled={isApplyingBuffer}
      >
        {isApplyingBuffer ? 'Applying...' : 'Apply'}
      </button>
    </div>
  </div>
)
