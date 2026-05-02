import { SinkPdoType, type SinkPdo } from '../../../../lib/device'
import { Dialog, DialogButton } from '../../../../ui/overlays'
import styles from '../../instruments/DrpdSinkControlInstrumentView.module.css'

type NonNullSinkPdo = Exclude<SinkPdo, null>

const getPdoTypeLabel = (pdo: SinkPdo | null | undefined): string => {
  if (!pdo) {
    return 'None'
  }
  switch (pdo.type) {
    case SinkPdoType.FIXED:
      return 'Fixed'
    case SinkPdoType.VARIABLE:
      return 'Variable'
    case SinkPdoType.BATTERY:
      return 'Battery'
    case SinkPdoType.AUGMENTED:
      return 'Augmented'
    case SinkPdoType.SPR_PPS:
      return 'SPR PPS'
    case SinkPdoType.SPR_AVS:
      return 'SPR AVS'
    case SinkPdoType.EPR_AVS:
      return 'EPR AVS'
    default:
      return 'Unknown'
  }
}

const getPdoListSecondaryLine = (pdo: NonNullSinkPdo): string => {
  switch (pdo.type) {
    case SinkPdoType.FIXED:
      return `${pdo.voltageV.toFixed(2)} V / ${pdo.maxCurrentA.toFixed(2)} A`
    case SinkPdoType.VARIABLE:
    case SinkPdoType.AUGMENTED:
    case SinkPdoType.SPR_PPS:
      return `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V / ${pdo.maxCurrentA.toFixed(2)} A`
    case SinkPdoType.BATTERY:
    case SinkPdoType.SPR_AVS:
    case SinkPdoType.EPR_AVS:
      return `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V / ${pdo.maxPowerW.toFixed(2)} W max`
    default:
      return '--'
  }
}

const isVoltageEditable = (pdo: SinkPdo | null | undefined): boolean => (
  pdo?.type === SinkPdoType.VARIABLE ||
  pdo?.type === SinkPdoType.AUGMENTED ||
  pdo?.type === SinkPdoType.SPR_PPS ||
  pdo?.type === SinkPdoType.BATTERY ||
  pdo?.type === SinkPdoType.SPR_AVS ||
  pdo?.type === SinkPdoType.EPR_AVS
)

export const SinkRequestPopover = ({
  instrumentId,
  open,
  onOpenChange,
  sinkPdoList,
  selectedIndex,
  selectedPdo,
  isRefreshingSinkData,
  voltageV,
  currentA,
  voltageHint,
  currentRangeLabel,
  validationMessage,
  requestErrorMessage,
  requestStatus,
  canSubmit,
  setSelectedIndex,
  setVoltageV,
  setCurrentA,
  setRequestErrorMessage,
  setRequestStatus,
  onCancel,
  onSubmit,
}: {
  instrumentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  sinkPdoList: SinkPdo[]
  selectedIndex: number
  selectedPdo: SinkPdo | null
  isRefreshingSinkData: boolean
  voltageV: string
  currentA: string
  voltageHint: string
  currentRangeLabel: string
  validationMessage: string | null
  requestErrorMessage: string | null
  requestStatus: 'idle' | 'sending' | 'success' | 'error'
  canSubmit: boolean
  setSelectedIndex: (value: number) => void
  setVoltageV: (value: string) => void
  setCurrentA: (value: string) => void
  setRequestErrorMessage: (value: string | null) => void
  setRequestStatus: (value: 'idle' | 'sending' | 'success' | 'error') => void
  onCancel: () => void
  onSubmit: () => void
}) => (
  <Dialog
    open={open}
    onOpenChange={onOpenChange}
    title="Sink request tuning"
    description="Choose a PDO and request voltage/current."
    dialogStyle={{ width: 'min(520px, calc(100vw - var(--space-32)))' }}
    footer={
      <>
        <DialogButton onClick={onCancel}>Cancel</DialogButton>
        <DialogButton variant="primary" onClick={onSubmit} disabled={!canSubmit}>
          {requestStatus === 'sending' ? 'Setting...' : 'Set PDO'}
        </DialogButton>
      </>
    }
  >
  <div id={`${instrumentId}-advanced-tune`} className={styles.advancedPanel}>
    <div className={styles.advancedLayout}>
      <div className={styles.pdoListPane}>
        {isRefreshingSinkData && sinkPdoList.length === 0 ? (
          <div className={styles.message}>Loading sink PDO list from device...</div>
        ) : null}
        <div
          className={styles.pdoList}
          role="listbox"
          aria-label="Available PDOs"
          data-testid="pdo-list"
        >
          {sinkPdoList.length === 0 ? (
            <div className={styles.emptyList}>No PDOs available</div>
          ) : (
            sinkPdoList.map((pdo, index) => (
              <button
                key={`pdo-${index}`}
                type="button"
                role="option"
                aria-selected={selectedIndex === index}
                className={`${styles.pdoListItem} ${selectedIndex === index ? styles.pdoListItemSelected : ''}`}
                onClick={() => {
                  setSelectedIndex(index)
                  setRequestErrorMessage(null)
                  setRequestStatus('idle')
                }}
              >
                <span className={styles.pdoListItemTitle}>
                  #{index + 1} {getPdoTypeLabel(pdo)}
                </span>
                <span className={styles.pdoListItemDetail}>
                  {pdo ? getPdoListSecondaryLine(pdo) : '--'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className={styles.requestPane}>
        <div className={styles.requestBody}>
          <label className={styles.fieldLabel} htmlFor={`${instrumentId}-voltage`}>
            Voltage
          </label>
          <input
            id={`${instrumentId}-voltage`}
            className={styles.control}
            value={selectedPdo?.type === SinkPdoType.FIXED ? selectedPdo.voltageV.toFixed(2) : voltageV}
            onChange={(event) => {
              setVoltageV(event.target.value)
              setRequestErrorMessage(null)
              setRequestStatus('idle')
            }}
            readOnly={!isVoltageEditable(selectedPdo)}
            aria-readonly={!isVoltageEditable(selectedPdo)}
            disabled={!selectedPdo}
          />

          <div className={styles.fieldMeta} />
          <div className={styles.fieldHint}>{voltageHint}</div>

          <label className={styles.fieldLabel} htmlFor={`${instrumentId}-current`}>
            Current
          </label>
          <input
            id={`${instrumentId}-current`}
            className={styles.control}
            value={currentA}
            onChange={(event) => {
              setCurrentA(event.target.value)
              setRequestErrorMessage(null)
              setRequestStatus('idle')
            }}
            disabled={!selectedPdo}
          />

          <div className={styles.fieldMeta} />
          <div className={styles.fieldHint}>
            {currentRangeLabel}
          </div>
        </div>

        <div
          className={`${styles.message} ${
            validationMessage || requestErrorMessage ? styles.messageError : ''
          }`}
          aria-live="polite"
        >
          {validationMessage ?? requestErrorMessage ?? ''}
        </div>

      </div>
    </div>
  </div>
  </Dialog>
)
