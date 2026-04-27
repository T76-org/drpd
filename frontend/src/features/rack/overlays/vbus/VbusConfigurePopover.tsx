import { VBusStatus, type DRPDDriverRuntime, type VBusInfo } from '../../../../lib/device'
import {
  Dialog,
  DialogButton,
  DialogForm,
  DialogFormRow,
  DialogInput,
} from '../../../../ui/overlays'

export const VBUS_OVP_MAX_V = 50
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
  displayUpdateRateInput,
  configureError,
  isApplyingConfig,
  setOvpThresholdInput,
  setOcpThresholdInput,
  setDisplayUpdateRateInput,
  setConfigureError,
  setIsApplyingConfig,
  setDisplayUpdateRateHz,
}: {
  instrumentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  driver: DRPDDriverRuntime | undefined
  vbusInfo: VBusInfo | null
  ovpThresholdInput: string
  ocpThresholdInput: string
  displayUpdateRateInput: string
  configureError: string | null
  isApplyingConfig: boolean
  setOvpThresholdInput: (value: string) => void
  setOcpThresholdInput: (value: string) => void
  setDisplayUpdateRateInput: (value: string) => void
  setConfigureError: (value: string | null) => void
  setIsApplyingConfig: (value: boolean) => void
  setDisplayUpdateRateHz: (value: number) => void
}) => {
  const closeDialog = () => {
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="VBUS settings"
      description={`OVP range: 0-${VBUS_OVP_MAX_V} V. OCP range: 0-${VBUS_OCP_MAX_A} A.`}
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
              const parsedDisplayUpdateRateHz = Number(displayUpdateRateInput)
              if (!Number.isFinite(parsedOvpV) || parsedOvpV < 0 || parsedOvpV > VBUS_OVP_MAX_V) {
                setConfigureError(`OVP must be between 0 and ${VBUS_OVP_MAX_V} V.`)
                return
              }
              if (!Number.isFinite(parsedOcpA) || parsedOcpA < 0 || parsedOcpA > VBUS_OCP_MAX_A) {
                setConfigureError(`OCP must be between 0 and ${VBUS_OCP_MAX_A} A.`)
                return
              }
              if (
                !Number.isFinite(parsedDisplayUpdateRateHz) ||
                parsedDisplayUpdateRateHz < VBUS_MIN_DISPLAY_UPDATE_RATE_HZ ||
                parsedDisplayUpdateRateHz > VBUS_MAX_DISPLAY_UPDATE_RATE_HZ
              ) {
                setConfigureError(
                  `Display rate must be between ${VBUS_MIN_DISPLAY_UPDATE_RATE_HZ} and ${VBUS_MAX_DISPLAY_UPDATE_RATE_HZ} Hz.`,
                )
                return
              }

              setIsApplyingConfig(true)
              setConfigureError(null)
              void Promise.resolve()
                .then(async () => {
                  setDisplayUpdateRateHz(parsedDisplayUpdateRateHz)
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
        <DialogFormRow label="OVP (V)" htmlFor={`${instrumentId}-ovp`}>
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
        <DialogFormRow label="OCP (A)" htmlFor={`${instrumentId}-ocp`}>
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
        <DialogFormRow
          label="Display Rate"
          htmlFor={`${instrumentId}-display-rate`}
          helpText={`Range: ${VBUS_MIN_DISPLAY_UPDATE_RATE_HZ}-${VBUS_MAX_DISPLAY_UPDATE_RATE_HZ} Hz`}
          errorText={configureError ?? undefined}
        >
          <DialogInput
            id={`${instrumentId}-display-rate`}
            type="number"
            min={VBUS_MIN_DISPLAY_UPDATE_RATE_HZ}
            max={VBUS_MAX_DISPLAY_UPDATE_RATE_HZ}
            step={1}
            value={displayUpdateRateInput}
            onChange={(event) => {
              setDisplayUpdateRateInput(event.currentTarget.value)
              setConfigureError(null)
            }}
            disabled={isApplyingConfig}
          />
        </DialogFormRow>
      </DialogForm>
    </Dialog>
  )
}
