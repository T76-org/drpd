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
 * VBUS instrument for Dr. PD analog telemetry.
 */
export class DrpdVbusInstrument extends Instrument {
  /**
   * Create a VBUS instrument definition.
   */
  public constructor() {
    super({
      identifier: 'com.mta.drpd.vbus',
      displayName: 'VBUS',
      supportedDeviceIdentifiers: ['com.mta.drpd'],
      defaultWidth: { mode: 'fixed', units: 3 },
      defaultUnits: 1
    })
  }
}

/**
 * Device status instrument for Dr. PD role/capture controls and status.
 */
export class DrpdDeviceStatusInstrument extends Instrument {
  /**
   * Create a device status instrument definition.
   */
  public constructor() {
    super({
      identifier: 'com.mta.drpd.device-status-panel',
      displayName: 'Device Status',
      supportedDeviceIdentifiers: ['com.mta.drpd'],
      defaultWidth: { mode: 'fixed', units: 2 },
      defaultUnits: 1
    })
  }
}

/**
 * CC line instrument for Dr. PD DUT/USDS CC telemetry.
 */
export class DrpdCcLinesInstrument extends Instrument {
  /**
   * Create a CC Lines instrument definition.
   */
  public constructor() {
    super({
      identifier: 'com.mta.drpd.cc-lines',
      displayName: 'CC Lines',
      supportedDeviceIdentifiers: ['com.mta.drpd'],
      defaultWidth: { mode: 'fixed', units: 2 },
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
      defaultWidth: { mode: 'fixed', units: 3 },
      defaultUnits: 1
    })
  }
}

/**
 * USB-PD message log instrument for Dr. PD capture logs.
 */
export class DrpdUsbPdLogInstrument extends Instrument {
  /**
   * Create a USB-PD log instrument definition.
   */
  public constructor() {
    super({
      identifier: 'com.mta.drpd.usbpd-log',
      displayName: 'Message Log',
      supportedDeviceIdentifiers: ['com.mta.drpd'],
      defaultWidth: { mode: 'fixed', units: 5 },
      defaultUnits: 1,
      defaultHeightMode: 'flex'
    })
  }
}

/**
 * Build the list of supported instrument definitions.
 */
export const getSupportedInstruments = (): Instrument[] => {
  return [
    new DrpdVbusInstrument(),
    new DrpdCcLinesInstrument(),
    new DrpdDeviceStatusInstrument(),
    new DrpdSinkControlInstrument(),
    new DrpdUsbPdLogInstrument(),
    new DrpdPlaceholderInstrument()
  ]
}
