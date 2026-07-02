/**
 * @file analogMonitor.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD analog monitor command group.
 */

import type { DRPDTransport } from './transport'
import {
  parseAccumulatedMeasurements,
  parseAnalogMonitorChannels,
  parseSingleNumber,
} from './parsers'
import type { AccumulatedMeasurements, AnalogMonitorChannels } from './types'

/**
 * Analog monitor command group for DRPD devices.
 */
export class DRPDAnalogMonitor {
  public static readonly VBUS_CALIBRATION_POINT_COUNT = 61
  public static readonly VBUS_CURRENT_CALIBRATION_POINT_COUNT = 13
  public static readonly VBUS_CURRENT_CALIBRATION_INTERVAL_MA = 500

  protected readonly transport: DRPDTransport ///< Transport instance.

  /**
   * Create an analog monitor command group.
   *
   * @param transport - Transport instance.
   */
  public constructor(transport: DRPDTransport) {
    this.transport = transport
  }

  /**
   * Query all analog monitor channels.
   *
   * @returns Analog monitor channel values.
   */
  public async getStatus(): Promise<AnalogMonitorChannels> {
    const response = await this.transport.queryText('MEAS:ALL?')
    return parseAnalogMonitorChannels(response)
  }

  /**
   * Query accumulated VBUS charge and energy counters.
   *
   * @returns Accumulated measurement counters.
   */
  public async getAccumulatedMeasurements(): Promise<AccumulatedMeasurements> {
    const response = await this.transport.queryText('MEAS:ACC?')
    return parseAccumulatedMeasurements(response)
  }

  /**
   * Reset accumulated VBUS charge and energy counters.
   */
  public async resetAccumulatedMeasurements(): Promise<void> {
    await this.transport.sendCommand('MEAS:ACC:RESET')
  }

  /**
   * Query VBUS voltage.
   *
   * @returns VBUS voltage.
   */
  public async getVBusVoltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:VBUS?')
    return parseSingleNumber(response, 'VBUS voltage')
  }

  /**
   * Query VBUS current.
   *
   * @returns VBUS current.
   */
  public async getVBusCurrent(): Promise<number> {
    const response = await this.transport.queryText('MEAS:CURR:VBUS?')
    return parseSingleNumber(response, 'VBUS current')
  }

  /**
   * Query raw scaled VBUS current before calibration.
   *
   * @returns Raw VBUS current.
   */
  public async getRawVBusCurrent(): Promise<number> {
    const response = await this.transport.queryText('MEAS:CURR:VBUS:RAW?')
    return parseSingleNumber(response, 'raw VBUS current')
  }

  /**
   * Query persisted VBUS voltage calibration table.
   *
   * @returns Additive voltage corrections indexed by nominal volt bucket.
   */
  public async getVBusCalibrationTable(): Promise<number[]> {
    const response = await this.transport.queryText('BUS:VBUS:CAL?')
    return parseCalibrationTable(
      response,
      DRPDAnalogMonitor.VBUS_CALIBRATION_POINT_COUNT,
      'VBUS calibration',
    )
  }

  /**
   * Capture a VBUS voltage calibration point for a nominal volt bucket.
   *
   * @param bucket - Nominal voltage bucket from 0 V through 60 V.
   */
  public async calibrateVBusBucket(bucket: number): Promise<void> {
    assertIntegerInRange(
      bucket,
      0,
      DRPDAnalogMonitor.VBUS_CALIBRATION_POINT_COUNT - 1,
      'bucket',
    )
    await this.transport.sendCommand('BUS:VBUS:CAL', bucket)
  }

  /**
   * Set one persisted VBUS voltage calibration table entry.
   *
   * @param bucket - Nominal voltage bucket from 0 V through 60 V.
   * @param correctionV - Additive correction in volts.
   */
  public async setVBusCalibrationTablePoint(bucket: number, correctionV: number): Promise<void> {
    assertIntegerInRange(
      bucket,
      0,
      DRPDAnalogMonitor.VBUS_CALIBRATION_POINT_COUNT - 1,
      'bucket',
    )
    assertFiniteNumber(correctionV, 'correctionV')
    await this.transport.sendCommand('BUS:VBUS:CAL:TAB', bucket, correctionV)
  }

  /**
   * Restore persisted VBUS voltage calibration to firmware defaults.
   */
  public async resetVBusCalibrationToDefaults(): Promise<void> {
    await this.transport.sendCommand('BUS:VBUS:CAL:DEF')
  }

  /**
   * Query persisted VBUS current raw calibration table.
   *
   * @returns Raw current readings indexed by true-current half-amp point.
   */
  public async getVBusCurrentCalibrationTable(): Promise<number[]> {
    const response = await this.transport.queryText('BUS:VBUS:CAL:CURR?')
    return parseCalibrationTable(
      response,
      DRPDAnalogMonitor.VBUS_CURRENT_CALIBRATION_POINT_COUNT,
      'VBUS current calibration',
    )
  }

  /**
   * Capture a VBUS current calibration point for a nominal current target.
   *
   * @param targetMa - Nominal current target from 0 mA through 6000 mA, aligned to 500 mA.
   */
  public async calibrateVBusCurrentBucket(targetMa: number): Promise<void> {
    const maxCurrentMa =
      (DRPDAnalogMonitor.VBUS_CURRENT_CALIBRATION_POINT_COUNT - 1) *
      DRPDAnalogMonitor.VBUS_CURRENT_CALIBRATION_INTERVAL_MA
    assertIntegerInRange(targetMa, 0, maxCurrentMa, 'targetMa')
    if (targetMa % DRPDAnalogMonitor.VBUS_CURRENT_CALIBRATION_INTERVAL_MA !== 0) {
      throw new Error(
        `targetMa must be aligned to ${DRPDAnalogMonitor.VBUS_CURRENT_CALIBRATION_INTERVAL_MA} mA`,
      )
    }
    await this.transport.sendCommand('BUS:VBUS:CAL:CURR', targetMa)
  }

  /**
   * Set one persisted VBUS current calibration table entry.
   *
   * @param targetMa - Nominal current target from 0 mA through 6000 mA, aligned to 500 mA.
   * @param rawCurrentA - Raw current reading in amps.
   */
  public async setVBusCurrentCalibrationTablePoint(
    targetMa: number,
    rawCurrentA: number,
  ): Promise<void> {
    const maxCurrentMa =
      (DRPDAnalogMonitor.VBUS_CURRENT_CALIBRATION_POINT_COUNT - 1) *
      DRPDAnalogMonitor.VBUS_CURRENT_CALIBRATION_INTERVAL_MA
    assertIntegerInRange(targetMa, 0, maxCurrentMa, 'targetMa')
    if (targetMa % DRPDAnalogMonitor.VBUS_CURRENT_CALIBRATION_INTERVAL_MA !== 0) {
      throw new Error(
        `targetMa must be aligned to ${DRPDAnalogMonitor.VBUS_CURRENT_CALIBRATION_INTERVAL_MA} mA`,
      )
    }
    assertFiniteNumber(rawCurrentA, 'rawCurrentA')
    if (rawCurrentA < 0) {
      throw new Error('rawCurrentA must be non-negative')
    }
    await this.transport.sendCommand('BUS:VBUS:CAL:CURR:TAB', targetMa, rawCurrentA)
  }

  /**
   * Restore persisted VBUS current calibration to firmware defaults.
   */
  public async resetVBusCurrentCalibrationToDefaults(): Promise<void> {
    await this.transport.sendCommand('BUS:VBUS:CAL:CURR:DEF')
  }

  /**
   * Query DUT CC1 voltage.
   *
   * @returns DUT CC1 voltage.
   */
  public async getDutCc1Voltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:CC:DUT1?')
    return parseSingleNumber(response, 'DUT CC1 voltage')
  }

  /**
   * Query DUT CC2 voltage.
   *
   * @returns DUT CC2 voltage.
   */
  public async getDutCc2Voltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:CC:DUT2?')
    return parseSingleNumber(response, 'DUT CC2 voltage')
  }

  /**
   * Query USDS CC1 voltage.
   *
   * @returns USDS CC1 voltage.
   */
  public async getUsdsCc1Voltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:CC:USDS1?')
    return parseSingleNumber(response, 'USDS CC1 voltage')
  }

  /**
   * Query USDS CC2 voltage.
   *
   * @returns USDS CC2 voltage.
   */
  public async getUsdsCc2Voltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:CC:USDS2?')
    return parseSingleNumber(response, 'USDS CC2 voltage')
  }

  /**
   * Query ADC reference voltage.
   *
   * @returns ADC reference voltage.
   */
  public async getAdcVrefVoltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:REF:ADC?')
    return parseSingleNumber(response, 'ADC reference voltage')
  }

  /**
   * Query current reference voltage.
   *
   * @returns Current reference voltage.
   */
  public async getCurrentRefVoltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:REF:CURR?')
    return parseSingleNumber(response, 'current reference voltage')
  }

  /**
   * Query ground reference voltage.
   *
   * @returns Ground reference voltage.
   */
  public async getGroundRefVoltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:REF:GND?')
    return parseSingleNumber(response, 'ground reference voltage')
  }
}

const parseCalibrationTable = (
  values: string[],
  expectedLength: number,
  label: string,
): number[] => {
  if (values.length !== expectedLength) {
    throw new Error(`Invalid ${label} response. Expected ${expectedLength} fields, got ${values.length}`)
  }
  return values.map((value, index) => parseSingleNumber([value], `${label} point ${index}`))
}

const assertIntegerInRange = (
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void => {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`)
  }
  if (value < minimum || value > maximum) {
    throw new Error(`${label} must be in range [${minimum}, ${maximum}]`)
  }
}

const assertFiniteNumber = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`)
  }
}
