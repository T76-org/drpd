import { Instrument } from '../../lib/instrument'

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
      defaultWidth: { mode: 'fixed', units: 10 },
      defaultUnits: 1,
      defaultFlex: 10,
      minWidth: '11rem',
      minHeight: '7rem',
    })
  }
}

/**
 * Accumulator instrument for Dr. PD analog telemetry.
 */
export class DrpdChargeEnergyInstrument extends Instrument {
  /**
   * Create an Accumulator instrument definition.
   */
  public constructor() {
    super({
      identifier: 'com.mta.drpd.charge-energy',
      displayName: 'Accumulator',
      supportedDeviceIdentifiers: ['com.mta.drpd'],
      defaultWidth: { mode: 'fixed', units: 7 },
      defaultUnits: 1,
      defaultFlex: 7,
      minWidth: '9rem',
      minHeight: '7rem',
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
      defaultWidth: { mode: 'fixed', units: 10 },
      defaultUnits: 1,
      defaultFlex: 10,
      minWidth: '11rem',
      minHeight: '7rem',
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
      defaultWidth: { mode: 'fixed', units: 7 },
      defaultUnits: 1,
      defaultFlex: 7,
      minWidth: '9rem',
      minHeight: '7rem',
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
      defaultWidth: { mode: 'fixed', units: 15 },
      defaultUnits: 1,
      defaultFlex: 15,
      minWidth: '15rem',
      minHeight: '7.5rem',
    })
  }
}

/**
 * Trigger instrument for Dr. PD trigger setup/status controls.
 */
export class DrpdTriggerInstrument extends Instrument {
  /**
   * Create a trigger instrument definition.
   */
  public constructor() {
    super({
      identifier: 'com.mta.drpd.trigger',
      displayName: 'Sync Trigger',
      supportedDeviceIdentifiers: ['com.mta.drpd'],
      defaultWidth: { mode: 'fixed', units: 18 },
      defaultUnits: 1,
      defaultFlex: 18,
      minWidth: '17rem',
      minHeight: '8rem',
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
      defaultWidth: { mode: 'fixed', units: 39 },
      defaultUnits: 1,
      defaultHeightMode: 'flex',
      defaultFlex: 3,
      minWidth: '48rem',
      minHeight: '12rem',
    })
  }
}

/**
 * Standalone timestrip instrument for Dr. PD capture logs.
 */
export class DrpdTimeStripInstrument extends Instrument {
  /**
   * Create a standalone timestrip instrument definition.
   */
  public constructor() {
    super({
      identifier: 'com.mta.drpd.timestrip',
      displayName: 'Timestrip',
      supportedDeviceIdentifiers: ['com.mta.drpd'],
      defaultWidth: { mode: 'flex' },
      defaultUnits: 1.25,
      defaultFlex: 100,
      minWidth: '22rem',
      minHeight: '230px',
    })
  }
}

/**
 * Message detail instrument for focused message inspection.
 */
export class DrpdMessageDetailInstrument extends Instrument {
  /**
   * Create a message detail instrument definition.
   */
  public constructor() {
    super({
      identifier: 'com.mta.drpd.message-detail',
      displayName: 'Message Detail',
      supportedDeviceIdentifiers: ['com.mta.drpd'],
      defaultWidth: { mode: 'flex' },
      defaultUnits: 1,
      defaultHeightMode: 'flex',
      defaultFlex: 1,
      minWidth: '20rem',
      minHeight: '12rem',
    })
  }
}

/**
 * Build the list of supported instrument definitions.
 */
export const getSupportedInstruments = (): Instrument[] => {
  return [
    new DrpdVbusInstrument(),
    new DrpdChargeEnergyInstrument(),
    new DrpdCcLinesInstrument(),
    new DrpdDeviceStatusInstrument(),
    new DrpdSinkControlInstrument(),
    new DrpdTriggerInstrument(),
    new DrpdUsbPdLogInstrument(),
    new DrpdTimeStripInstrument(),
    new DrpdMessageDetailInstrument(),
  ]
}
