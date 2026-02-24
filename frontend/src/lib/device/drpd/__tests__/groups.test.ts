import { describe, expect, it } from 'vitest'
import { DRPDAnalogMonitor } from '../analogMonitor'
import { DRPDCCBus } from '../ccBus'
import { DRPDCapture } from '../capture'
import { DRPDSink } from '../sink'
import { DRPDTrigger } from '../trigger'
import { DRPDVBus } from '../vbus'
import type { DRPDTransport, DRPDSCPIParam } from '../transport'
import { CCBusRole, OnOffState, TriggerEventType, TriggerSyncMode } from '../types'

/**
 * Mock transport for group tests.
 */
class MockTransport implements DRPDTransport {
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
    ])

    const group = new DRPDAnalogMonitor(transport)
    const status = await group.getStatus()
    expect(status.vbus).toBeCloseTo(5.0)
  })

  it('sends CC bus role updates with raw enum tokens', async () => {
    const transport = new MockTransport()
    const group = new DRPDCCBus(transport)
    await group.setRole(CCBusRole.SOURCE)
    expect(transport.commands[0]).toEqual({
      command: 'BUS:CC:ROLE',
      params: [{ raw: 'SOURCE' }],
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
    expect(info.status).toBe('CONNECTED')
    expect(info.negotiatedVoltageMv).toBe(5000)
    expect(info.negotiatedCurrentMa).toBe(1500)
    expect(info.negotiatedPdo).toEqual({
      type: 'SPR_PPS',
      minVoltageV: 3.3,
      maxVoltageV: 11,
      maxCurrentA: 2.5,
    })
  })

  it('sets trigger configuration using raw enum tokens', async () => {
    const transport = new MockTransport()
    const group = new DRPDTrigger(transport)
    await group.setEventType(TriggerEventType.MESSAGE_COMPLETE)
    await group.setSyncMode(TriggerSyncMode.TOGGLE)
    expect(transport.commands[0]).toEqual({
      command: 'TRIG:EV:TYPE',
      params: [{ raw: 'MESSAGE_COMPLETE' }],
    })
    expect(transport.commands[1]).toEqual({
      command: 'TRIG:SYNC:MODE',
      params: [{ raw: 'TOGGLE' }],
    })
  })

  it('queries VBUS thresholds from firmware float V/A responses', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('BUS:VBUS:STAT?', ['ENABLED'])
    transport.textResponses.set('BUS:VBUS:OVPThreshold?', ['12.000000'])
    transport.textResponses.set('BUS:VBUS:OCPThreshold?', ['3.000000'])
    const group = new DRPDVBus(transport)
    const info = await group.getInfo()
    expect(info.status).toBe('ENABLED')
    expect(info.ovpThresholdMv).toBe(12000)
    expect(info.ocpThresholdMa).toBe(3000)
  })

  it('sends VBUS thresholds in firmware V/A units while keeping frontend mV/mA API', async () => {
    const transport = new MockTransport()
    const group = new DRPDVBus(transport)
    await group.setOvpThresholdMv(12000)
    await group.setOcpThresholdMa(3000)
    expect(transport.commands).toEqual([
      { command: 'BUS:VBUS:OVPThreshold', params: [12] },
      { command: 'BUS:VBUS:OCPThreshold', params: [3] },
    ])
  })
})
