import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from 'react'
import {
  DRPDDeviceDefinition,
  buildUSBFilters,
  parseDRPDFirmwareUF2,
  uploadDRPDFirmwareUF2,
} from '../../lib/device'
import WinUSBTransport from '../../lib/transport/winusb'
import styles from './FirmwareUploadTestPage.module.css'

const UPDATER_RECONNECT_TIMEOUT_MS = 10_000
const UPDATER_RECONNECT_POLL_MS = 250
const UPDATER_READ_TIMEOUT_MS = 15_000
const UPDATER_WRITE_TIMEOUT_MS = 5_000

type SelectedDeviceInfo = {
  vendorId: number
  productId: number
  serialNumber: string | null
  productName: string | null
}

const sleep = async (durationMs: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs)
  })
}

const describeDevice = (device: USBDevice | SelectedDeviceInfo): string => {
  const product = device.productName ?? 'DRPD'
  const serial = device.serialNumber ?? 'unknown serial'
  return `${product} (${serial})`
}

const supportsFirmwareUpdate = (transport: WinUSBTransport): boolean =>
  'updateFirmware' in transport && typeof transport.updateFirmware === 'function'

const openUpdaterTransport = async (device: USBDevice): Promise<WinUSBTransport> => {
  const transport = new WinUSBTransport(device, {
    readTimeoutMs: UPDATER_READ_TIMEOUT_MS,
    writeTimeoutMs: UPDATER_WRITE_TIMEOUT_MS,
  })
  await transport.open()
  return transport
}

const findMatchingAuthorizedDevice = async (
  info: SelectedDeviceInfo,
  trace?: (message: string) => void,
): Promise<USBDevice | null> => {
  const devices = await navigator.usb.getDevices()
  trace?.(`Authorized USB devices: ${devices.map(describeDevice).join(', ') || 'none'}`)
  return devices.find((device) => {
    if (device.vendorId !== info.vendorId || device.productId !== info.productId) {
      return false
    }
    if (info.serialNumber != null) {
      return (device.serialNumber ?? null) === info.serialNumber
    }
    return (device.productName ?? null) === info.productName
  }) ?? null
}

const waitForUpdaterTransport = async (
  info: SelectedDeviceInfo,
  trace: (message: string) => void,
): Promise<{ device: USBDevice; transport: WinUSBTransport }> => {
  const deadline = Date.now() + UPDATER_RECONNECT_TIMEOUT_MS
  let attempt = 0
  let lastError: unknown = null
  while (Date.now() < deadline) {
    const device = await findMatchingAuthorizedDevice(info, trace)
    if (device) {
      attempt += 1
      trace(`Updater open attempt ${attempt}: ${describeDevice(device)}`)
      try {
        const transport = await openUpdaterTransport(device)
        trace(`Updater WinUSB opened on interface ${transport.claimedInterfaceNumber ?? 'unknown'}`)
        const updaterStatus = await transport.getFirmwareUpdateStatus()
        trace(
          `Updater status: state=${updaterStatus.state} base=0x${updaterStatus.baseOffset.toString(16)} length=${updaterStatus.totalLength} written=${updaterStatus.bytesWritten}`,
        )
        return { device, transport }
      } catch (error) {
        lastError = error
        trace(`Updater open attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`)
        if (device.opened) {
          await device.close().catch(() => undefined)
        }
      }
    }
    await sleep(UPDATER_RECONNECT_POLL_MS)
  }
  throw new Error(
    `Timed out opening updater WinUSB transport for ${describeDevice(info)}${lastError instanceof Error ? `; last error: ${lastError.message}` : ''}`,
  )
}

/**
 * Temporary manual page for validating browser firmware uploads.
 */
export const FirmwareUploadTestPage = () => {
  const [status, setStatus] = useState('Disconnected')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [device, setDevice] = useState<USBDevice | null>(null)
  const [transport, setTransport] = useState<WinUSBTransport | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [imageSummary, setImageSummary] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [isBusy, setIsBusy] = useState(false)
  const [traceLines, setTraceLines] = useState<string[]>([])

  const deviceDefinition = useMemo(() => new DRPDDeviceDefinition(), [])

  const trace = useCallback((message: string) => {
    const line = `${new Date().toISOString()} ${message}`
    console.info(`[firmware-upload] ${message}`)
    setTraceLines((lines) => [...lines.slice(-79), line])
  }, [])

  const closeTransport = useCallback(async () => {
    if (transport) {
      await transport.close()
    }
    setTransport(null)
  }, [transport])

  const connect = useCallback(async () => {
    setError(null)
    setSuccess(null)
    if (!('usb' in navigator) || !navigator.usb) {
      setError('WebUSB is not available in this browser.')
      return
    }
    try {
      setIsBusy(true)
      setStatus('Requesting device...')
      const selected = await navigator.usb.requestDevice({
        filters: buildUSBFilters([deviceDefinition]),
      })
      trace(`Selected ${describeDevice(selected)}`)
      setStatus('Opening WinUSB transport...')
      const nextTransport = new WinUSBTransport(selected)
      await nextTransport.open()
      trace(`Application WinUSB opened on interface ${nextTransport.claimedInterfaceNumber ?? 'unknown'}`)
      setDevice(selected)
      setTransport(nextTransport)
      setStatus(`Connected to ${describeDevice(selected)} via WinUSB`)
    } catch (connectError) {
      setStatus('Disconnected')
      setError(connectError instanceof Error ? connectError.message : String(connectError))
    } finally {
      setIsBusy(false)
    }
  }, [deviceDefinition, trace])

  const disconnect = useCallback(async () => {
    setError(null)
    setSuccess(null)
    try {
      setIsBusy(true)
      setStatus('Disconnecting...')
      await closeTransport()
      setDevice(null)
      setStatus('Disconnected')
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : String(disconnectError))
      setStatus('Disconnected')
    } finally {
      setIsBusy(false)
    }
  }, [closeTransport])

  const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    setFile(nextFile)
    setImageSummary(null)
    setError(null)
    setSuccess(null)
    setProgress(0)
    if (!nextFile) {
      return
    }
    try {
      const bytes = new Uint8Array(await nextFile.arrayBuffer())
      const parsed = parseDRPDFirmwareUF2(bytes)
      setImageSummary(
        `${parsed.chunks.length} chunk(s), ${parsed.totalLength.toLocaleString()} app bytes, CRC 0x${parsed.crc32.toString(16).padStart(8, '0')}`,
      )
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : String(parseError))
    }
  }, [])

  const upload = useCallback(async () => {
    setError(null)
    setSuccess(null)
    setProgress(0)
    if (!device || !transport) {
      setError('Connect a DRPD device first.')
      return
    }
    if (!file) {
      setError('Choose a combined UF2 firmware file first.')
      return
    }

    const selectedInfo: SelectedDeviceInfo = {
      vendorId: device.vendorId,
      productId: device.productId,
      serialNumber: device.serialNumber ?? null,
      productName: device.productName ?? null,
    }

    try {
      setIsBusy(true)
      setStatus('Reading firmware file...')
      const image = new Uint8Array(await file.arrayBuffer())
      const parsed = parseDRPDFirmwareUF2(image)
      setImageSummary(
        `${parsed.chunks.length} chunk(s), ${parsed.totalLength.toLocaleString()} app bytes, CRC 0x${parsed.crc32.toString(16).padStart(8, '0')}`,
      )

      setStatus('Requesting updater reboot...')
      trace('Sending SYST:FIRM:UPD over WinUSB')
      await transport.sendCommand('SYST:FIRM:UPD')
      trace('Updater reboot command acknowledged; closing application transport')
      await closeTransport()

      setStatus('Waiting for updater WinUSB transport...')
      const { device: updaterDevice, transport: updaterTransport } = await waitForUpdaterTransport(
        selectedInfo,
        trace,
      )
      if (!supportsFirmwareUpdate(updaterTransport)) {
        await updaterTransport.close()
        throw new Error('Updater did not expose the WinUSB update transport.')
      }

      setDevice(updaterDevice)
      setTransport(updaterTransport)
      setStatus('Uploading firmware...')
      trace('Starting firmware upload')
      await uploadDRPDFirmwareUF2(updaterTransport, image, {
        onProgress: ({ bytesWritten, totalLength }) => {
          setProgress(totalLength > 0 ? bytesWritten / totalLength : 0)
        },
      })
      trace('Firmware upload finished')
      setProgress(1)
      setSuccess('Upload finished. The device should reboot into the updated application.')
      setStatus('Upload complete')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError))
      setStatus('Upload failed')
    } finally {
      setIsBusy(false)
    }
  }, [closeTransport, device, file, trace, transport])

  useEffect(() => {
    return () => {
      if (transport) {
        transport.close().catch(() => undefined)
      }
    }
  }, [transport])

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <h1 className={styles.title}>DRPD Firmware Upload Test</h1>
        <p className={styles.subtitle}>
          Temporary manual page for sending a combined UF2 to the resident WinUSB updater.
        </p>

        <div className={styles.section}>
          <div className={styles.actions}>
            <button className={styles.button} type="button" onClick={connect} disabled={isBusy || !!device}>
              Connect
            </button>
            <button className={styles.button} type="button" onClick={disconnect} disabled={isBusy || !device}>
              Disconnect
            </button>
          </div>
          <div className={styles.status}>{status}</div>
        </div>

        <div className={styles.section}>
          <input
            className={styles.fileInput}
            type="file"
            accept=".uf2,application/octet-stream"
            onChange={handleFileChange}
            disabled={isBusy}
          />
          <div className={styles.meta}>
            <span>File: <span className={styles.code}>{file?.name ?? 'None selected'}</span></span>
            <span>Image: <span className={styles.code}>{imageSummary ?? 'Not parsed'}</span></span>
          </div>
          <button className={styles.button} type="button" onClick={upload} disabled={isBusy || !device || !file}>
            Upload via Updater
          </button>
          <div className={styles.progressShell} aria-label="Upload progress">
            <div
              className={styles.progressBar}
              style={{ '--upload-progress': `${Math.round(progress * 100)}%` } as CSSProperties}
            />
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.heading}>Trace</h2>
          <pre className={styles.trace}>{traceLines.join('\n') || 'No trace entries yet.'}</pre>
        </div>

        {success ? <div className={styles.success}>{success}</div> : null}
        {error ? <div className={styles.error}>Error: {error}</div> : null}
      </section>
    </main>
  )
}
