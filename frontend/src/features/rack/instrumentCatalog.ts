import { Instrument } from '../../lib/instrument'

/**
 * Dummy instrument compatible with the Dr. PD device.
 */
export class DrpdPlaceholderInstrument extends Instrument {
  /**
   * Create a placeholder instrument definition.
   */
  public constructor() {
    super({
      identifier: 'com.mta.drpd.placeholder',
      displayName: 'Dr. PD Placeholder',
      supportedDeviceIdentifiers: ['com.mta.drpd'],
      defaultWidth: { mode: 'fixed', units: 6 },
      defaultUnits: 2
    })
  }
}

/**
 * Device status instrument for Dr. PD analog telemetry.
 */
export class DrpdDeviceStatusInstrument extends Instrument {
  /**
   * Create a device status instrument definition.
   */
  public constructor() {
    super({
      identifier: 'com.mta.drpd.device-status',
      displayName: 'Device Status',
      supportedDeviceIdentifiers: ['com.mta.drpd'],
      defaultWidth: { mode: 'flex' },
      defaultUnits: 1
    })
  }
}

/**
 * Sink control instrument for Dr. PD power negotiation controls.
 */
export class DrpdSinkControlInstrument extends Instrument {
  /**
   * Create a sink control instrument definition.
   */
  public constructor() {
    super({
      identifier: 'com.mta.drpd.sink-control',
      displayName: 'Sink Control',
      supportedDeviceIdentifiers: ['com.mta.drpd'],
      defaultWidth: { mode: 'fixed', units: 4 },
      defaultUnits: 2
    })
  }
}

/**
 * Build the list of supported instrument definitions.
 */
export const getSupportedInstruments = (): Instrument[] => {
  return [
    new DrpdDeviceStatusInstrument(),
    new DrpdSinkControlInstrument(),
    new DrpdPlaceholderInstrument()
  ]
}
