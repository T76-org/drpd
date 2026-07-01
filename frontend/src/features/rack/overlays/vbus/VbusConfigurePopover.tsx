import { VBusStatus, type DRPDDriverRuntime, type VBusInfo } from '../../../../lib/device'
import {
  Dialog,
  DialogButton,
  DialogForm,
  DialogFormRow,
  DialogInput,
} from '../../../../ui/overlays'

export const VBUS_OVP_MAX_V = 60
export const VBUS_OCP_MAX_A = 6
export const VBUS_MIN_DISPLAY_UPDATE_RATE_HZ = 1
export const VBUS_MAX_DISPLAY_UPDATE_RATE_HZ = 30

export const VbusConfigurePopover = ({
  instrumentId,
  open,
  onOpenChange,
  driver,
  vbusInfo,
  ovpThresholdInput,
  ocpThresholdInput,
  configureError,
  isApplyingConfig,
  setOvpThresholdInput,
  setOcpThresholdInput,
  setConfigureError,
  setIsApplyingConfig,
}: {
  instrumentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  driver: DRPDDriverRuntime | undefined
  vbusInfo: VBusInfo | null
  ovpThresholdInput: string
  ocpThresholdInput: string
  configureError: string | null
  isApplyingConfig: boolean
  setOvpThresholdInput: (value: string) => void
  setOcpThresholdInput: (value: string) => void
  setConfigureError: (value: string | null) => void
  setIsApplyingConfig: (value: boolean) => void
}) => {
  const closeDialog = () => {
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="OVP/OCP settings"
      dismissible={!isApplyingConfig}
      footer={
        <>
          <DialogButton
            onClick={() => {
              setConfigureError(null)
              closeDialog()
            }}
            disabled={isApplyingConfig}
          >
            Cancel
          </DialogButton>
          <DialogButton
            variant="primary"
            onClick={() => {
              if (!driver) {
                return
              }
              const parsedOvpV = Number(ovpThresholdInput)
              const parsedOcpA = Number(ocpThresholdInput)
              if (!Number.isFinite(parsedOvpV) || parsedOvpV < 0 || parsedOvpV > VBUS_OVP_MAX_V) {
                setConfigureError(`OVP must be between 0 and ${VBUS_OVP_MAX_V} V.`)
                return
              }
              if (!Number.isFinite(parsedOcpA) || parsedOcpA < 0 || parsedOcpA > VBUS_OCP_MAX_A) {
                setConfigureError(`OCP must be between 0 and ${VBUS_OCP_MAX_A} A.`)
                return
              }

              setIsApplyingConfig(true)
              setConfigureError(null)
              void Promise.resolve()
                .then(async () => {
                  if (vbusInfo?.status === VBusStatus.OVP || vbusInfo?.status === VBusStatus.OCP) {
                    await driver.vbus.resetFault()
                  }
                  await driver.vbus.setOvpThresholdMv(Math.round(parsedOvpV * 1000))
                  await driver.vbus.setOcpThresholdMa(Math.round(parsedOcpA * 1000))
                  await driver.refreshState()
                  closeDialog()
                })
                .catch((error) => {
                  const message = error instanceof Error ? error.message : String(error)
                  setConfigureError(message)
                })
                .finally(() => {
                  setIsApplyingConfig(false)
                })
            }}
            disabled={isApplyingConfig}
          >
            {isApplyingConfig ? 'Applying...' : 'Apply'}
          </DialogButton>
        </>
      }
    >
      <DialogForm>
        <DialogFormRow
          label="OVP (V)"
          htmlFor={`${instrumentId}-ovp`}
          helpText={`Range: 0-${VBUS_OVP_MAX_V} V`}
        >
          <DialogInput
            id={`${instrumentId}-ovp`}
            type="number"
            min={0}
            max={VBUS_OVP_MAX_V}
            step={0.01}
            value={ovpThresholdInput}
            onChange={(event) => {
              setOvpThresholdInput(event.currentTarget.value)
              setConfigureError(null)
            }}
            disabled={isApplyingConfig}
          />
        </DialogFormRow>
        <DialogFormRow
          label="OCP (A)"
          htmlFor={`${instrumentId}-ocp`}
          helpText={`Range: 0-${VBUS_OCP_MAX_A} A`}
          errorText={configureError ?? undefined}
        >
          <DialogInput
            id={`${instrumentId}-ocp`}
            type="number"
            min={0}
            max={VBUS_OCP_MAX_A}
            step={0.01}
            value={ocpThresholdInput}
            onChange={(event) => {
              setOcpThresholdInput(event.currentTarget.value)
              setConfigureError(null)
            }}
            disabled={isApplyingConfig}
          />
        </DialogFormRow>
      </DialogForm>
    </Dialog>
  )
}
