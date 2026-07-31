import { describe, expect, it } from 'vitest'
import { DRPDAnalogMonitor } from '../analogMonitor'
import { DRPDCCBus } from '../ccBus'
import { DRPDCapture } from '../capture'
import { DRPDSink } from '../sink'
import { DRPDTest } from '../test'
import { DRPDTrigger } from '../trigger'
import { DRPDSystem } from '../system'
import { DRPDVBus } from '../vbus'
import type { DRPDTransport, DRPDSCPIParam } from '../transport'
import {
  CCBusRole,
  OnOffState,
  SinkInquiryOutcome,
  SinkInquiryType,
  SinkRequestOutcome,
  TestCcRole,
  TriggerEventType,
  TriggerMessageTypeFilterClass,
  TriggerSenderFilter,
  TriggerSyncMode,
} from '../types'

/**
 * Mock transport for group tests.
 */
class MockTransport implements DRPDTransport {
  public readonly kind = 'winusb' as const
  ///< Captured command history.
  public readonly commands: Array<{ command: string; params: DRPDSCPIParam[] }> = []
  ///< Preloaded text responses by command.
  public textResponses = new Map<string, string[]>()
  ///< Preloaded binary responses by command.
  public binaryResponses = new Map<string, Uint8Array>()

  /**
   * Record a SCPI command.
   *
   * @param command - SCPI command string.
   * @param params - SCPI parameters.
   */
  public async sendCommand(command: string, ...params: DRPDSCPIParam[]): Promise<void> {
    this.commands.push({ command, params })
  }

  /**
   * Return a mock text response for a SCPI query.
   *
   * @param command - SCPI command string.
   * @param params - SCPI parameters.
   * @returns Mock response list.
   */
  public async queryText(command: string, ...params: DRPDSCPIParam[]): Promise<string[]> {
    void params
    const response = this.textResponses.get(command)
    if (!response) {
      throw new Error(`Missing text response for ${command}`)
    }
    return response
  }

  /**
   * Return a mock binary response for a SCPI query.
   *
   * @param command - SCPI command string.
   * @param params - SCPI parameters.
   * @returns Mock response payload.
   */
  public async queryBinary(command: string, ...params: DRPDSCPIParam[]): Promise<Uint8Array> {
    void params
    const response = this.binaryResponses.get(command)
    if (!response) {
      throw new Error(`Missing binary response for ${command}`)
    }
    return response
  }
}

describe('DRPD command groups', () => {
  it('queries, updates, and resets BMC decoder configuration', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('SYST:CONF:PHY:BMCD:CC:VREF:VOLT?', ['0.4'])
    transport.textResponses.set('SYST:CONF:PHY:BMCD:CC:VREF:PWM:FREQ?', ['100000'])
    const configuration = new DRPDSystem(transport).configuration.bmcDecoder

    await expect(configuration.getCCVrefVoltage()).resolves.toBe(0.4)
    await expect(configuration.getCCVrefPwmFrequencyHz()).resolves.toBe(100000)
    await configuration.setCCVrefVoltage(0.45)
    await configuration.setCCVrefPwmFrequencyHz(101000)
    await configuration.resetCCVrefVoltage()
    await configuration.resetCCVrefPwmFrequencyHz()

    expect(transport.commands).toEqual([
      { command: 'SYST:CONF:PHY:BMCD:CC:VREF:VOLT', params: [0.45] },
      { command: 'SYST:CONF:PHY:BMCD:CC:VREF:PWM:FREQ', params: [101000] },
      { command: 'SYST:CONF:PHY:BMCD:CC:VREF:VOLT:RES', params: [] },
      { command: 'SYST:CONF:PHY:BMCD:CC:VREF:PWM:FREQ:RES', params: [] },
    ])
    await expect(configuration.setCCVrefVoltage(0.23)).rejects.toThrow(RangeError)
    await expect(configuration.setCCVrefPwmFrequencyHz(10500)).rejects.toThrow(RangeError)
  })
  it('formats analog monitor queries', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('MEAS:ALL?', [
      '1000',
      '5.0',
      '0.1',
      '0.2',
      '0.3',
      '0.4',
      '0.5',
      '1.2',
      '0.0',
      '0.6',
      '2500',
      '12',
      '34',
    ])

    const group = new DRPDAnalogMonitor(transport)
    const status = await group.getStatus()
    expect(status.vbus).toBeCloseTo(5.0)
    expect(status.accumulatedEnergyMwh).toBe(34)
  })

  it('queries accumulated measurements', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('MEAS:ACC?', ['2500', '12', '34'])

    const group = new DRPDAnalogMonitor(transport)
    const counters = await group.getAccumulatedMeasurements()
    expect(counters.accumulationElapsedTimeUs).toBe(2500n)
    expect(counters.accumulatedChargeMah).toBe(12)
    expect(counters.accumulatedEnergyMwh).toBe(34)
  })

  it('resets accumulated measurements', async () => {
    const transport = new MockTransport()
    const group = new DRPDAnalogMonitor(transport)

    await group.resetAccumulatedMeasurements()

    expect(transport.commands[0]).toEqual({
      command: 'MEAS:ACC:RESET',
      params: [],
    })
  })

  it('queries and calibrates VBUS voltage calibration points', async () => {
    const transport = new MockTransport()
    transport.textResponses.set(
      'BUS:VBUS:CAL?',
      Array.from({ length: 61 }, (_, index) => (index / 100).toString()),
    )
    transport.textResponses.set('MEAS:VOLT:VBUS?', ['5.25'])

    const group = new DRPDAnalogMonitor(transport)
    const table = await group.getVBusCalibrationTable()
    const voltage = await group.getVBusVoltage()
    await group.setVBusCalibrationTablePoint(20, 0)
    await group.calibrateVBusBucket(20)
    await group.resetVBusCalibrationToDefaults()

    expect(table).toHaveLength(61)
    expect(table[20]).toBeCloseTo(0.2)
    expect(voltage).toBeCloseTo(5.25)
    expect(transport.commands[0]).toEqual({
      command: 'BUS:VBUS:CAL:TAB',
      params: [20, 0],
    })
    expect(transport.commands[1]).toEqual({
      command: 'BUS:VBUS:CAL',
      params: [20],
    })
    expect(transport.commands[2]).toEqual({
      command: 'BUS:VBUS:CAL:DEF',
      params: [],
    })
  })

  it('rejects malformed VBUS voltage calibration tables', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('BUS:VBUS:CAL?', ['0'])

    const group = new DRPDAnalogMonitor(transport)

    await expect(group.getVBusCalibrationTable()).rejects.toThrow(
      'Invalid VBUS calibration response. Expected 61 fields, got 1',
    )
  })

  it('queries and calibrates VBUS current calibration points', async () => {
    const transport = new MockTransport()
    transport.textResponses.set(
      'BUS:VBUS:CAL:CURR?',
      Array.from({ length: 13 }, (_, index) => (index / 2).toString()),
    )
    transport.textResponses.set('MEAS:CURR:VBUS:RAW?', ['1.75'])

    const group = new DRPDAnalogMonitor(transport)
    const table = await group.getVBusCurrentCalibrationTable()
    const rawCurrent = await group.getRawVBusCurrent()
    await group.setVBusCurrentCalibrationTablePoint(500, 0.5)
    await group.calibrateVBusCurrentBucket(500)
    await group.resetVBusCurrentCalibrationToDefaults()

    expect(table).toHaveLength(13)
    expect(table[3]).toBeCloseTo(1.5)
    expect(rawCurrent).toBeCloseTo(1.75)
    expect(transport.commands[0]).toEqual({
      command: 'BUS:VBUS:CAL:CURR:TAB',
      params: [500, 0.5],
    })
    expect(transport.commands[1]).toEqual({
      command: 'BUS:VBUS:CAL:CURR',
      params: [500],
    })
    expect(transport.commands[2]).toEqual({
      command: 'BUS:VBUS:CAL:CURR:DEF',
      params: [],
    })
  })

  it('rejects malformed VBUS current calibration tables', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('BUS:VBUS:CAL:CURR?', ['0'])

    const group = new DRPDAnalogMonitor(transport)

    await expect(group.getVBusCurrentCalibrationTable()).rejects.toThrow(
      'Invalid VBUS current calibration response. Expected 13 fields, got 1',
    )
  })

  it('sends CC bus role updates with raw enum tokens', async () => {
    const transport = new MockTransport()
    const group = new DRPDCCBus(transport)
    await group.setRole(CCBusRole.OBSERVER)
    expect(transport.commands[0]).toEqual({
      command: 'BUS:CC:ROLE',
      params: [{ raw: 'OBSERVER' }],
    })
  })

  it('queries capture status and returns ON/OFF', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('BUS:CC:CAP:EN?', ['ON'])
    const group = new DRPDCapture(transport)
    const status = await group.getCaptureEnabled()
    expect(status).toBe(OnOffState.ON)
  })

  it('queries capture count', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['3'])
    const group = new DRPDCapture(transport)
    const count = await group.getCapturedMessageCount()
    expect(count).toBe(3)
  })

  it('parses sink status and negotiated values', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('SINK:STATUS?', ['PE_SNK_READY'])
    transport.textResponses.set('SINK:STATUS:PDO?', ['SPR_PPS,3.3,11.0,2.5'])
    transport.textResponses.set('SINK:STATUS:VOLTAGE?', ['5.000000'])
    transport.textResponses.set('SINK:STATUS:CURRENT?', ['1.500000'])
    transport.textResponses.set('SINK:STATUS:ERROR?', ['0'])
    const group = new DRPDSink(transport)
    const info = await group.getSinkInfo()
    expect(info.status).toBe('PE_SNK_READY')
    expect(info.negotiatedVoltageMv).toBe(5000)
    expect(info.negotiatedCurrentMa).toBe(1500)
    expect(info.negotiatedPdo).toEqual({
      type: 'SPR_PPS',
      minVoltageV: 3.3,
      maxVoltageV: 11,
      maxCurrentA: 2.5,
    })
  })

  it('sets and queries sink EPR entry policy', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('SINK:EPR:EN?', ['OFF'])
    const group = new DRPDSink(transport)

    await group.setEprEnabled(true)
    const enabled = await group.getEprEnabled()

    expect(transport.commands[0]).toEqual({
      command: 'SINK:EPR:EN',
      params: [{ raw: 'ON' }],
    })
    expect(enabled).toBe(false)
  })

  it('sets and queries sink PPS status query policy', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('SINK:PPS:STATUS:EN?', ['OFF'])
    const group = new DRPDSink(transport)

    await group.setPpsStatusQueryEnabled(true)
    const enabled = await group.getPpsStatusQueryEnabled()

    expect(transport.commands[0]).toEqual({
      command: 'SINK:PPS:STATUS:EN',
      params: [{ raw: 'ON' }],
    })
    expect(enabled).toBe(false)
  })

  it('queries sink request status outcomes', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('SINK:REQUEST:STATUS?', ['ACCEPTED,2,9000,3000'])
    const group = new DRPDSink(transport)

    const status = await group.getRequestStatus()

    expect(status).toEqual({
      outcome: SinkRequestOutcome.ACCEPTED,
      index: 2,
      voltageMv: 9000,
      currentMa: 3000,
    })
  })

  it('sends a typed sink inquiry and reads its response', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('SINK:INQ:STAT?', [
      'RESPONSE,17,GET_REVISION,1,12,6',
    ])
    transport.binaryResponses.set('SINK:INQ:RESP?', new Uint8Array([1, 2, 3]))
    const group = new DRPDSink(transport)

    await group.sendInquiry(SinkInquiryType.GET_REVISION)
    await expect(group.getInquiryStatus()).resolves.toEqual({
      outcome: SinkInquiryOutcome.RESPONSE,
      requestId: 17,
      type: SinkInquiryType.GET_REVISION,
      responseClass: 1,
      responseType: 12,
      responseLength: 6,
    })
    await expect(group.getInquiryResponse()).resolves.toEqual(new Uint8Array([1, 2, 3]))
    expect(transport.commands[0]).toEqual({
      command: 'SINK:INQ',
      params: [{ raw: 'GET_REVISION' }],
    })
  })

  it('rejects malformed sink inquiry status responses', async () => {
    const transport = new MockTransport()
    const group = new DRPDSink(transport)
    transport.textResponses.set('SINK:INQ:STAT?', ['RESPONSE,17,GET_REVISION'])
    await expect(group.getInquiryStatus()).rejects.toThrow('expected 6 fields')

    transport.textResponses.set('SINK:INQ:STAT?', [
      'MADE_UP,17,GET_REVISION,1,12,6',
    ])
    await expect(group.getInquiryStatus()).rejects.toThrow('Invalid sink inquiry outcome')

    transport.textResponses.set('SINK:INQ:STAT?', [
      'RESPONSE,17,UNKNOWN,1,12,6',
    ])
    await expect(group.getInquiryStatus()).rejects.toThrow('Invalid sink inquiry type')
  })

  it.each(Object.values(SinkInquiryOutcome))(
    'parses the %s sink inquiry outcome',
    async (outcome) => {
      const transport = new MockTransport()
      transport.textResponses.set('SINK:INQ:STAT?', [
        `${outcome},17,GET_REVISION,0,0,0`,
      ])
      await expect(new DRPDSink(transport).getInquiryStatus()).resolves.toMatchObject({ outcome })
    },
  )

  it('queries and sets local sink capability PDOs', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('SINK:CAP:SPR:COUNT?', ['7'])
    transport.textResponses.set('SINK:CAP:SPR?', ['305419896'])
    transport.textResponses.set('SINK:CAP:EPR:COUNT?', ['1'])
    transport.textResponses.set('SINK:CAP:EPR?', ['0'])
    const group = new DRPDSink(transport)

    expect(await group.getSprCapabilityCount()).toBe(7)
    expect(await group.getSprCapabilityPdo(0)).toBe(305419896)
    await group.setSprCapabilityPdo(0, 0)
    expect(await group.getEprCapabilityCount()).toBe(1)
    expect(await group.getEprCapabilityPdo(0)).toBe(0)
    await group.setEprCapabilityPdo(0, 0)

    expect(transport.commands).toEqual([
      { command: 'SINK:CAP:SPR', params: [0, 0] },
      { command: 'SINK:CAP:EPR', params: [0, 0] },
    ])
  })

  it('sets trigger configuration using raw enum tokens', async () => {
    const transport = new MockTransport()
    const group = new DRPDTrigger(transport)
    await group.setEventType(TriggerEventType.MESSAGE_COMPLETE)
    await group.setSenderFilter(TriggerSenderFilter.SOURCE)
    await group.setSyncMode(TriggerSyncMode.PULL_DOWN)
    expect(transport.commands[0]).toEqual({
      command: 'TRIG:EV:TYPE',
      params: [{ raw: 'MESSAGE_COMPLETE' }],
    })
    expect(transport.commands[1]).toEqual({
      command: 'TRIG:EV:SENDER',
      params: [{ raw: 'SOURCE' }],
    })
    expect(transport.commands[2]).toEqual({
      command: 'TRIG:SYNC:MODE',
      params: [{ raw: 'PULL_DOWN' }],
    })
  })

  it('parses trigger sender filter queries', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('TRIG:EV:SENDER?', ['CABLE'])
    const group = new DRPDTrigger(transport)

    await expect(group.getSenderFilter()).resolves.toBe(TriggerSenderFilter.CABLE)
  })

  it('formats trigger message type filter commands and parses queries', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('TRIG:EV:MSGTYPE:FILTER?', ['CONTROL:3 DATA:2 DATA:15'])
    const group = new DRPDTrigger(transport)

    await group.setMessageTypeFilters([
      { class: TriggerMessageTypeFilterClass.CONTROL, messageTypeNumber: 3 },
      { class: TriggerMessageTypeFilterClass.DATA, messageTypeNumber: 2 },
    ])
    const filters = await group.getMessageTypeFilters()
    await group.clearMessageTypeFilters()

    expect(transport.commands[0]).toEqual({
      command: 'TRIG:EV:MSGTYPE:FILTER:CLEAR',
      params: [],
    })
    expect(transport.commands[1]).toEqual({
      command: 'TRIG:EV:MSGTYPE:FILTER',
      params: [0, 'CONTROL:3'],
    })
    expect(transport.commands[2]).toEqual({
      command: 'TRIG:EV:MSGTYPE:FILTER',
      params: [1, 'DATA:2'],
    })
    expect(filters).toEqual([
      { class: TriggerMessageTypeFilterClass.CONTROL, messageTypeNumber: 3 },
      { class: TriggerMessageTypeFilterClass.DATA, messageTypeNumber: 2 },
      { class: TriggerMessageTypeFilterClass.DATA, messageTypeNumber: 15 },
    ])
    expect(transport.commands[3]).toEqual({
      command: 'TRIG:EV:MSGTYPE:FILTER:CLEAR',
      params: [],
    })
  })

  it('queries VBUS thresholds from firmware float V/A responses', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('BUS:VBUS:STAT?', ['ENABLED', '1234', 'NONE'])
    transport.textResponses.set('BUS:VBUS:OVPT?', ['12.000000'])
    transport.textResponses.set('BUS:VBUS:OCPT?', ['3.000000'])
    const group = new DRPDVBus(transport)
    const info = await group.getInfo()
    expect(info.status).toBe('ENABLED')
    expect(info.ovpThresholdMv).toBe(12000)
    expect(info.ocpThresholdMa).toBe(3000)
    expect(info.ovpEventTimestampUs).toBe(1234n)
    expect(info.ocpEventTimestampUs).toBeNull()
  })

  it('sends VBUS thresholds in firmware V/A units while keeping frontend mV/mA API', async () => {
    const transport = new MockTransport()
    const group = new DRPDVBus(transport)
    await group.setOvpThresholdMv(60000)
    await group.setOcpThresholdMa(3000)
    expect(transport.commands).toEqual([
      { command: 'BUS:VBUS:OVPT', params: [60] },
      { command: 'BUS:VBUS:OCPT', params: [3] },
    ])
  })

  it('uses firmware TEST:CCROLE role tokens', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('TEST:CCROLE:CC1?', ['SOURCE_1_5A'])
    const group = new DRPDTest(transport)

    await group.setCc1Role(TestCcRole.SOURCE_1_5A)
    const role = await group.getCc1Role()

    expect(transport.commands[0]).toEqual({
      command: 'TEST:CCROLE:CC1',
      params: [{ raw: 'SOURCE_1_5A' }],
    })
    expect(role).toBe(TestCcRole.SOURCE_1_5A)
  })
})
