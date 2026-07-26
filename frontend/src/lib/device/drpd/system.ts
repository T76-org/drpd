/**
 * @file system.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD system command group.
 */

import type { DRPDTransport } from './transport'
import { parseDeviceIdentity, parseErrorResponse, parseSingleBigInt, parseSingleInt, parseSingleNumber } from './parsers'
import type { DeviceIdentity, MemoryUsage } from './types'

/**
 * System command group for DRPD devices.
 */
export class DRPDSystem {
  public readonly configuration: DRPDSystemConfiguration ///< Persisted system configuration.
  protected readonly transport: DRPDTransport ///< Transport instance.

  /**
   * Create a system command group.
   *
   * @param transport - Transport instance.
   */
  public constructor(transport: DRPDTransport) {
    this.transport = transport
    this.configuration = new DRPDSystemConfiguration(transport)
  }

  /**
   * Query the device identification string.
   *
   * @returns Device identity fields.
   */
  public async identify(): Promise<DeviceIdentity> {
    const response = await this.transport.queryText('*IDN?')
    console.info(`[drpd.system] *IDN? response=${response.join(' ')}`)
    const identity = parseDeviceIdentity(response)
    try {
      console.info('[drpd.system] Querying hardware revision with SYST:HW:REV?')
      const hardwareRevisionResponse = await this.transport.queryText('SYST:HW:REV?')
      const hardwareRevision = hardwareRevisionResponse[0]?.trim()
      console.info(
        `[drpd.system] SYST:HW:REV? response=${hardwareRevisionResponse.join(' ')}`,
      )
      if (hardwareRevision) {
        return { ...identity, hardwareRevision }
      }
    } catch (error) {
      console.info(
        `[drpd.system] SYST:HW:REV? unavailable: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    return identity
  }

  /**
   * Reset the device.
   */
  public async reset(): Promise<void> {
    await this.transport.sendCommand('*RST')
  }

  /**
   * Request reboot into the resident firmware updater.
   */
  public async enterFirmwareUpdate(): Promise<void> {
    await this.transport.sendCommand('SYST:FIRM:UPD')
  }

  /**
   * Query the system error queue.
   *
   * @returns Error code and message.
   */
  public async getError(): Promise<{ code: number; message: string }> {
    const response = await this.transport.queryText('SYST:ERR?')
    return parseErrorResponse(response)
  }

  /**
   * Query system memory usage.
   *
   * @returns Memory usage fields.
   */
  public async getMemoryUsage(): Promise<MemoryUsage> {
    const response = await this.transport.queryText('SYST:MEM?')
    if (!response.length) {
      throw new Error('Missing memory usage response')
    }
    if (response.length === 1) {
      return { freeBytes: parseSingleInt(response, 'free memory') }
    }
    return {
      totalBytes: parseSingleInt([response[0]], 'total memory'),
      freeBytes: parseSingleInt([response[1]], 'free memory'),
    }
  }

  /**
   * Query the device clock frequency in Hz.
   *
   * @returns Clock frequency in Hz.
   */
  public async getClockFrequencyHz(): Promise<number> {
    const response = await this.transport.queryText('SYST:SP?')
    return parseSingleInt(response, 'clock frequency')
  }

  /**
   * Query device uptime in microseconds.
   *
   * @returns Uptime in microseconds.
   */
  public async getUptimeUs(): Promise<bigint> {
    const response = await this.transport.queryText('SYST:UPT?')
    return parseSingleBigInt(response, 'uptime')
  }

  /**
   * Query the device timestamp in microseconds.
   *
   * @returns Timestamp in microseconds.
   */
  public async getTimestampUs(): Promise<bigint> {
    const response = await this.transport.queryText('SYST:TIME?')
    return parseSingleBigInt(response, 'timestamp')
  }
}

export class DRPDBMCDecoderConfiguration {
  public static readonly VREF_MIN_VOLTS = 0.2
  public static readonly VREF_MAX_VOLTS = 2.5
  public static readonly VREF_STEP_VOLTS = 0.05
  public static readonly VREF_DEFAULT_VOLTS = 0.7
  public static readonly PWM_MIN_HZ = 10_000
  public static readonly PWM_MAX_HZ = 500_000
  public static readonly PWM_STEP_HZ = 1_000
  public static readonly PWM_DEFAULT_HZ = 100_000

  protected readonly transport: DRPDTransport

  public constructor(transport: DRPDTransport) {
    this.transport = transport
  }

  public async getCCVrefVoltage(): Promise<number> {
    return parseSingleNumber(
      await this.transport.queryText('SYST:CONF:PHY:BMCD:CC:VREF:VOLT?'),
      'CC reference voltage',
    )
  }

  public async setCCVrefVoltage(voltage: number): Promise<void> {
    const steps = (voltage - DRPDBMCDecoderConfiguration.VREF_MIN_VOLTS) /
      DRPDBMCDecoderConfiguration.VREF_STEP_VOLTS
    if (!Number.isFinite(voltage) || voltage < DRPDBMCDecoderConfiguration.VREF_MIN_VOLTS ||
      voltage > DRPDBMCDecoderConfiguration.VREF_MAX_VOLTS || Math.abs(steps - Math.round(steps)) > 1e-9) {
      throw new RangeError('CC reference voltage must be 0.20–2.50 V in 0.05 V increments')
    }
    await this.transport.sendCommand('SYST:CONF:PHY:BMCD:CC:VREF:VOLT', voltage)
  }

  public async resetCCVrefVoltage(): Promise<void> {
    await this.transport.sendCommand('SYST:CONF:PHY:BMCD:CC:VREF:VOLT:RES')
  }

  public async getCCVrefPwmFrequencyHz(): Promise<number> {
    return parseSingleInt(
      await this.transport.queryText('SYST:CONF:PHY:BMCD:CC:VREF:PWM:FREQ?'),
      'CC reference PWM frequency',
    )
  }

  public async setCCVrefPwmFrequencyHz(frequencyHz: number): Promise<void> {
    if (!Number.isInteger(frequencyHz) || frequencyHz < DRPDBMCDecoderConfiguration.PWM_MIN_HZ ||
      frequencyHz > DRPDBMCDecoderConfiguration.PWM_MAX_HZ ||
      frequencyHz % DRPDBMCDecoderConfiguration.PWM_STEP_HZ !== 0) {
      throw new RangeError('CC reference PWM frequency must be 10000–500000 Hz in 1000 Hz increments')
    }
    await this.transport.sendCommand('SYST:CONF:PHY:BMCD:CC:VREF:PWM:FREQ', frequencyHz)
  }

  public async resetCCVrefPwmFrequencyHz(): Promise<void> {
    await this.transport.sendCommand('SYST:CONF:PHY:BMCD:CC:VREF:PWM:FREQ:RES')
  }
}

export class DRPDSystemConfiguration {
  public readonly bmcDecoder: DRPDBMCDecoderConfiguration

  public constructor(transport: DRPDTransport) {
    this.bmcDecoder = new DRPDBMCDecoderConfiguration(transport)
  }
}
