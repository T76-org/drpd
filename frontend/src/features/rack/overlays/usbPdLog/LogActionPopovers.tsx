import {
  Dialog,
  DialogButton,
  DialogForm,
  DialogFormRow,
  DialogInput,
} from '../../../../ui/overlays'
import {
  MESSAGE_LOG_COLUMNS,
  type MessageLogColumnId,
  type MessageLogColumnVisibility,
} from './messageLogColumns'
import styles from './LogActionPopovers.module.css'

export const MessageLogClearPopover = ({
  open,
  onOpenChange,
  clearError,
  isClearing,
  onCancel,
  onClear,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clearError: string | null
  isClearing: boolean
  onCancel: () => void
  onClear: () => void
}) => (
  <Dialog
    open={open}
    onOpenChange={onOpenChange}
    title="Clear logs"
    description={
      clearError ??
      'This will permanently delete all logged messages and analog samples, and clear the time strip.'
    }
    dismissible={!isClearing}
    footer={
      <>
        <DialogButton
        onClick={onCancel}
        disabled={isClearing}
      >
        Cancel
        </DialogButton>
        <DialogButton
        variant="danger"
        onClick={onClear}
        disabled={isClearing}
      >
        {isClearing ? 'Clearing...' : 'Clear'}
        </DialogButton>
      </>
    }
  >
    Are you sure?
  </Dialog>
)

export const MessageLogConfigurePopover = ({
  open,
  onOpenChange,
  instrumentId,
  minBuffer,
  maxBuffer,
  bufferInput,
  bufferError,
  columnVisibility,
  isApplyingBuffer,
  setBufferInput,
  setBufferError,
  setColumnVisibility,
  onCancel,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  instrumentId: string
  minBuffer: number
  maxBuffer: number
  bufferInput: string
  bufferError: string | null
  columnVisibility: MessageLogColumnVisibility
  isApplyingBuffer: boolean
  setBufferInput: (value: string) => void
  setBufferError: (value: string | null) => void
  setColumnVisibility: (value: MessageLogColumnVisibility) => void
  onCancel: () => void
  onApply: () => void
}) => {
  const visibleColumnCount = MESSAGE_LOG_COLUMNS.filter((column) => columnVisibility[column.id]).length

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Message log settings"
      dismissible={!isApplyingBuffer}
      footer={
        <>
          <DialogButton
            onClick={onCancel}
            disabled={isApplyingBuffer}
          >
            Cancel
          </DialogButton>
          <DialogButton
            variant="primary"
            onClick={onApply}
            disabled={isApplyingBuffer}
          >
            {isApplyingBuffer ? 'Applying...' : 'Apply'}
          </DialogButton>
        </>
      }
    >
      <DialogForm>
        <DialogFormRow
          label="Buffer size"
          htmlFor={`${instrumentId}-max-buffer`}
          helpText={`Range: ${minBuffer}-${maxBuffer}`}
          errorText={bufferError ?? undefined}
        >
          <DialogInput
            id={`${instrumentId}-max-buffer`}
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
        </DialogFormRow>
        <DialogFormRow
          label="Columns"
          helpText="Choose which Message Log table columns are visible."
        >
          <div className={styles.columnPicker}>
            {MESSAGE_LOG_COLUMNS.map((column) => {
              const checked = columnVisibility[column.id]
              return (
                <label key={column.id} className={styles.columnOption}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isApplyingBuffer || (checked && visibleColumnCount <= 1)}
                    onChange={(event) => {
                      setColumnVisibility({
                        ...columnVisibility,
                        [column.id as MessageLogColumnId]: event.currentTarget.checked,
                      })
                    }}
                  />
                  {column.label}
                </label>
              )
            })}
          </div>
        </DialogFormRow>
      </DialogForm>
    </Dialog>
  )
}
