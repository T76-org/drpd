import type { VBusInfo } from '../../../../lib/device'

export const prepareVbusConfigureDialog = ({
  vbusInfo,
  setConfigureError,
  setOvpThresholdInput,
  setOcpThresholdInput,
}: {
  vbusInfo: VBusInfo | null
  setConfigureError: (value: string | null) => void
  setOvpThresholdInput: (value: string) => void
  setOcpThresholdInput: (value: string) => void
}) => {
  setConfigureError(null)
  setOvpThresholdInput(
    vbusInfo && Number.isFinite(vbusInfo.ovpThresholdMv)
      ? (vbusInfo.ovpThresholdMv / 1000).toFixed(2)
      : '',
  )
  setOcpThresholdInput(
    vbusInfo && Number.isFinite(vbusInfo.ocpThresholdMa)
      ? (vbusInfo.ocpThresholdMa / 1000).toFixed(2)
      : '',
  )
}
