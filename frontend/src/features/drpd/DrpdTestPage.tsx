import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DRPDDevice,
  DRPDDeviceDefinition,
  buildUSBFilters,
  type AnalogMonitorChannels,
} from '../../lib/device'
import type { DRPDUSBTransport } from '../../lib/transport/drpdUsb'
import { openPreferredDRPDTransport } from '../../lib/transport/drpdUsb'
import styles from './DrpdTestPage.module.css'

/**
 * Format a number with a fixed number of decimals.
 *
 * @param value - Numeric value to format.
 * @param decimals - Number of decimal places.
 * @returns Formatted string.
 */
const formatNumber = (value: number, decimals = 3): string => {
  if (!Number.isFinite(value)) {
    return '—'
  }
  return value.toFixed(decimals)
}

/**
 * DRPD device test page for connecting and reading analog monitor stats.
 */
export const DrpdTestPage = () => {
  const [status, setStatus] = useState('Disconnected')
  const [error, setError] = useState<string | null>(null)
  const [device, setDevice] = useState<USBDevice | null>(null)
  const [transport, setTransport] = useState<DRPDUSBTransport | null>(null)
  const [driver, setDriver] = useState<DRPDDevice | null>(null)
  const [analogStats, setAnalogStats] = useState<AnalogMonitorChannels | null>(null)

  const deviceDefinition = useMemo(() => new DRPDDeviceDefinition(), [])

  const connect = useCallback(async () => {
    setError(null)
    if (!('usb' in navigator)) {
      setError('WebUSB is not available in this browser.')
      return
    }

    try {
      setStatus('Requesting device...')
      const filters = buildUSBFilters([deviceDefinition])
      const selected = await navigator.usb.requestDevice({ filters })
      const nextTransport = await openPreferredDRPDTransport(selected)
      await deviceDefinition.connectDevice(selected)
      setDevice(selected)
      setTransport(nextTransport)
      setDriver(deviceDefinition.createDriver(nextTransport))
      setStatus('Connected')
    } catch (connectError) {
      setStatus('Disconnected')
      setError(connectError instanceof Error ? connectError.message : String(connectError))
    }
  }, [deviceDefinition])

  const disconnect = useCallback(async () => {
    setError(null)
    try {
      setStatus('Disconnecting...')
      if (transport) {
        await transport.close()
      }
      deviceDefinition.disconnectDevice()
      setDevice(null)
      setTransport(null)
      setDriver(null)
      setAnalogStats(null)
      setStatus('Disconnected')
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : String(disconnectError))
      setStatus('Disconnected')
    }
  }, [deviceDefinition, transport])

  const readAnalogMonitor = useCallback(async () => {
    setError(null)
    if (!driver) {
      setError('Connect a device before reading analog monitor stats.')
      return
    }
    try {
      setStatus('Reading analog monitor...')
      const stats = await driver.analogMonitor.getStatus()
      setAnalogStats(stats)
      setStatus('Connected')
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : String(readError))
      setStatus('Connected')
    }
  }, [driver])

  useEffect(() => {
    return () => {
      if (transport) {
        transport.close().catch(() => undefined)
      }
    }
  }, [transport])

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <h1 className={styles.title}>DRPD Device Test</h1>
        <p className={styles.subtitle}>
          Connect a DRPD device over WebUSB and read analog monitor stats.
        </p>

        <div className={styles.actions}>
          <button className={styles.button} type="button" onClick={connect} disabled={!!device}>
            Connect
          </button>
          <button className={styles.button} type="button" onClick={disconnect} disabled={!device}>
            Disconnect
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={readAnalogMonitor}
            disabled={!driver}
          >
            Read Analog Monitor
          </button>
        </div>

        <div className={styles.status}>
          Status: {status}
          {device ? ` · ${device.productName ?? 'DRPD'} (${device.serialNumber ?? 'unknown'})` : ''}
        </div>

        <div className={styles.kv}>
          <div className={styles.kvItem}>
            <div className={styles.kvLabel}>VBUS Voltage (V)</div>
            <div className={styles.kvValue}>
              {analogStats ? formatNumber(analogStats.vbus) : '—'}
            </div>
          </div>
          <div className={styles.kvItem}>
            <div className={styles.kvLabel}>VBUS Current (A)</div>
            <div className={styles.kvValue}>
              {analogStats ? formatNumber(analogStats.ibus) : '—'}
            </div>
          </div>
          <div className={styles.kvItem}>
            <div className={styles.kvLabel}>DUT CC1 Voltage (V)</div>
            <div className={styles.kvValue}>
              {analogStats ? formatNumber(analogStats.dutCc1) : '—'}
            </div>
          </div>
          <div className={styles.kvItem}>
            <div className={styles.kvLabel}>DUT CC2 Voltage (V)</div>
            <div className={styles.kvValue}>
              {analogStats ? formatNumber(analogStats.dutCc2) : '—'}
            </div>
          </div>
          <div className={styles.kvItem}>
            <div className={styles.kvLabel}>USDS CC1 Voltage (V)</div>
            <div className={styles.kvValue}>
              {analogStats ? formatNumber(analogStats.usdsCc1) : '—'}
            </div>
          </div>
          <div className={styles.kvItem}>
            <div className={styles.kvLabel}>USDS CC2 Voltage (V)</div>
            <div className={styles.kvValue}>
              {analogStats ? formatNumber(analogStats.usdsCc2) : '—'}
            </div>
          </div>
          <div className={styles.kvItem}>
            <div className={styles.kvLabel}>ADC VREF (V)</div>
            <div className={styles.kvValue}>
              {analogStats ? formatNumber(analogStats.adcVref) : '—'}
            </div>
          </div>
          <div className={styles.kvItem}>
            <div className={styles.kvLabel}>Ground Ref (V)</div>
            <div className={styles.kvValue}>
              {analogStats ? formatNumber(analogStats.groundRef) : '—'}
            </div>
          </div>
          <div className={styles.kvItem}>
            <div className={styles.kvLabel}>Current Ref (V)</div>
            <div className={styles.kvValue}>
              {analogStats ? formatNumber(analogStats.currentVref) : '—'}
            </div>
          </div>
          <div className={styles.kvItem}>
            <div className={styles.kvLabel}>Accum Elapsed (us)</div>
            <div className={styles.kvValue}>
              {analogStats ? analogStats.accumulationElapsedTimeUs.toString() : '—'}
            </div>
          </div>
          <div className={styles.kvItem}>
            <div className={styles.kvLabel}>Accum Charge (mAh)</div>
            <div className={styles.kvValue}>
              {analogStats ? analogStats.accumulatedChargeMah.toString() : '—'}
            </div>
          </div>
          <div className={styles.kvItem}>
            <div className={styles.kvLabel}>Accum Energy (mWh)</div>
            <div className={styles.kvValue}>
              {analogStats ? analogStats.accumulatedEnergyMwh.toString() : '—'}
            </div>
          </div>
        </div>

        {error ? <div className={styles.error}>Error: {error}</div> : null}
      </div>
    </div>
  )
}
