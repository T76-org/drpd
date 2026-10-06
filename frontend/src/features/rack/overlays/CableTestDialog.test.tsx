import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CCBusRole, type CableTestResult } from '../../../lib/device'
import { CableTestDialog, type CableTestClient } from './CableTestDialog'
const waiting: CableTestResult = { generation: 1, outcome: 'WAITING', vconnContact: 0, goodCRC: false, revision: 2, body: new Uint8Array() }
/** Fake hardware client with asynchronous command completion. */
const fakeClient = () => ({ ccBus: {
  setRole: vi.fn().mockResolvedValue(undefined),
  getCableTestResult: vi.fn().mockResolvedValue(waiting),
}, refreshState: vi.fn().mockResolvedValue(undefined) })
afterEach(() => { cleanup(); vi.useRealTimers() })
describe('Cable Test dialog', () => {
  it('groups cable information under human-readable headings without raw encodings', async () => {
    const client = fakeClient()
    const body = Uint8Array.from('41A800FF0000601C000000000000000043260A00'.match(/../g)!, (hex) => Number.parseInt(hex, 16))
    client.ccBus.getCableTestResult.mockResolvedValue({ ...waiting, outcome: 'IDENTITY', vconnContact: 1, goodCRC: true, body })
    render(<CableTestDialog client={client} onClose={vi.fn()} onError={vi.fn()} />)
    const table = await screen.findByRole('table', { name: 'Cable identity' })
    await waitFor(() => expect(within(table).getByText('Cable Information')).toBeTruthy())
    for (const title of ['General Information', 'Cable Information']) {
      expect(within(table).getByText(title).closest('th')?.getAttribute('colspan')).toBe('2')
    }
    expect(within(table).getAllByRole('columnheader').slice(0, 2).map((cell) => cell.textContent)).toEqual(['Field', 'Value'])
    for (const [field, meaning] of [
      ['Maximum Current', '5 A'],
      ['Maximum Voltage', '50 V'],
      ['Maximum USB Speed', 'USB4 Gen3 — up to 40 Gbit/s with two lanes'],
      ['Cable Type', 'Passive Cable'],
      ['USB Host Capable', 'No'],
    ]) {
      const row = within(table).getByRole('rowheader', { name: field }).closest('tr')!
      expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([meaning])
    }
    expect(within(table).queryByText('Product Information')).toBeNull()
    expect(within(table).queryByText('Certification Information')).toBeNull()
    expect(within(table).queryByText('USB Product ID')).toBeNull()
    expect(within(table).queryByText('XID')).toBeNull()
    const cableSection = within(table).getByText('Cable Information').closest('tbody')!
    expect(within(cableSection).getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(['Maximum Current', 'Maximum Voltage', 'EPR Support', 'Maximum USB Speed', 'Plug Type', 'Cable Latency', 'VCONN Requirements', 'Hardware Version', 'Firmware Version', 'Data Format Version'])
    const generalSection = within(table).getByText('General Information').closest('tbody')!
    expect(within(generalSection).getAllByRole('rowheader').slice(0, 3).map((cell) => cell.textContent)).toEqual(['Cable Type', 'Connector Type', 'USB Vendor ID'])
    expect(within(table).queryByText('Raw Value')).toBeNull()
    expect(within(table).queryByText('0b011')).toBeNull()
    expect(screen.queryByText(/Raw identity response/)).toBeNull()
  })
  it('shows the optional active-cable features section', async () => {
    const client = fakeClient()
    const body = Uint8Array.from([0x41,0xa8,0,0xff,0,0,0,0x20,0,0,0,0,0,0,0,0,0x43,0x26,0x0a,0,1,0,0,0])
    client.ccBus.getCableTestResult.mockResolvedValue({ ...waiting, outcome: 'IDENTITY', vconnContact: 1, goodCRC: true, body })
    render(<CableTestDialog client={client} onClose={vi.fn()} onError={vi.fn()} />)
    expect(await screen.findByText('Active Cable Features')).toBeTruthy()
    expect(screen.getByText('Cable Information')).toBeTruthy()
    expect(screen.getByText('Maximum Operating Temperature')).toBeTruthy()
    const features = screen.getByText('Active Cable Features').closest('tbody')!
    expect(within(features).getAllByRole('rowheader').slice(0, 3).map((cell) => cell.textContent)).toEqual(['USB4 Support', 'USB 3.2 Support', 'USB 2.0 Support'])
    expect(screen.queryByText('Active Cable VDO1')).toBeNull()
    expect(screen.queryByText('Active Cable VDO2')).toBeNull()
  })
  it.each([
    [0, 'USB 2.0 — up to 480 Mbit/s'],
    [1, 'USB 3.2 Gen1 — 5 Gbit/s per lane (up to 10 Gbit/s with two lanes)'],
    [2, 'USB 3.2/USB4 Gen2 — 10 Gbit/s per lane (up to 20 Gbit/s with two lanes)'],
    [3, 'USB4 Gen3 — up to 40 Gbit/s with two lanes'],
    [4, 'USB4 Gen4 — up to 80 Gbit/s with two lanes'],
    [7, 'Reserved (speed unknown)'],
  ])('explains reported USB speed class %s', async (code, description) => {
    const client = fakeClient()
    const body = Uint8Array.from('41A800FF0000601C000000000000000043260A00'.match(/../g)!, (hex) => Number.parseInt(hex, 16))
    body[16] = (body[16] & ~7) | Number(code)
    client.ccBus.getCableTestResult.mockResolvedValue({ ...waiting, outcome: 'IDENTITY', goodCRC: true, body })
    render(<CableTestDialog client={client} onClose={vi.fn()} onError={vi.fn()} />)
    expect(await screen.findByText(description)).toBeTruthy()
    expect(screen.getByText(description).closest('tr')?.title).toContain('not measured throughput')
  })
  it('starts standalone test, gives exact empty message, stops on unmount', async () => {
    const client = fakeClient()
    const view = render(<CableTestDialog client={client} onClose={vi.fn()} onError={vi.fn()} />)
    await waitFor(() => expect(client.ccBus.getCableTestResult).toHaveBeenCalled())
    expect(screen.getByRole('status').textContent).toBe('No cable detected, damaged cable, or cable without an e-marker. Ensure that the cable is not connected to any device and plug it into Port 1.')
    expect(screen.getByText('No cable detected, damaged cable, or cable without an e-marker.').tagName).toBe('STRONG')
    expect(screen.queryByText('Product Information')).toBeNull()
    expect(screen.queryByText('Certification Information')).toBeNull()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status').getAttribute('data-state')).toBe('waiting')
    expect(screen.queryByText(/Plug the cable into Port 1 \(DUT\)/)).toBeNull()
    expect(screen.getByLabelText('USB Vendor ID blank').textContent).toBe('')
    expect(client.ccBus.setRole).toHaveBeenCalledWith(CCBusRole.CABLE_TEST)
    view.unmount()
    await waitFor(() => expect(client.ccBus.setRole).toHaveBeenLastCalledWith(CCBusRole.DISABLED))
  })
  it('renders advertised identity, then blanks all fields after removal', async () => {
    vi.useFakeTimers()
    const client = fakeClient()
    const body = Uint8Array.from([0x41,0xa8,0,0xff,0x34,0x12,0,0x18,1,0,0,0,1,0,0x78,0x56,0x62,2,2,0x11])
    client.ccBus.getCableTestResult.mockResolvedValueOnce({ ...waiting, outcome: 'IDENTITY', vconnContact: 2, goodCRC: true, body })
    render(<CableTestDialog client={client} onClose={vi.fn()} onError={vi.fn()} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const dialogHeight = screen.getByRole('dialog').style.height
    expect(dialogHeight).not.toBe('')
    expect(screen.getByText('0x1234')).toBeTruthy()
    expect(screen.getByText('E-marked cable detected.').tagName).toBe('STRONG')
    expect(screen.getByRole('status').getAttribute('data-state')).toBe('detected')
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    expect(screen.getByRole('dialog').style.height).toBe(dialogHeight)
    expect(screen.queryByText('0x1234')).toBeNull()
    expect(screen.getByLabelText('USB Vendor ID blank').textContent).toBe('')
  })
  it('does not treat Ra timeout as proof of missing marker', async () => {
    const client = fakeClient()
    client.ccBus.getCableTestResult.mockResolvedValue({ ...waiting, outcome: 'NO_RESPONSE', vconnContact: 1 })
    render(<CableTestDialog client={client} onClose={vi.fn()} onError={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toBe('No cable detected, damaged cable, or cable without an e-marker. Ensure that the cable is not connected to any device and plug it into Port 1.')
    expect(screen.getByLabelText('USB Vendor ID blank').textContent).toBe('')
  })
  it('serializes shutdown across remounts while start is in flight', async () => {
    let finish!: () => void
    const client = fakeClient()
    client.ccBus.setRole.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    const first = render(<CableTestDialog client={client} onClose={vi.fn()} onError={vi.fn()} />)
    await waitFor(() => expect(client.ccBus.setRole).toHaveBeenCalledTimes(1))
    first.unmount()
    const second = render(<CableTestDialog client={client} onClose={vi.fn()} onError={vi.fn()} />)
    await act(async () => { finish() })
    await waitFor(() => expect(client.ccBus.setRole).toHaveBeenCalledTimes(3))
    expect(client.ccBus.setRole.mock.calls.map(([role]) => role)).toEqual([CCBusRole.CABLE_TEST, CCBusRole.DISABLED, CCBusRole.CABLE_TEST])
    second.unmount()
  })
  it('discards late identity received after session closes', async () => {
    let finish!: (result: CableTestResult) => void
    const client: CableTestClient = fakeClient()
    vi.mocked(client.ccBus.getCableTestResult).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const view = render(<CableTestDialog client={client} onClose={vi.fn()} onError={vi.fn()} />)
    await waitFor(() => expect(client.ccBus.getCableTestResult).toHaveBeenCalled())
    view.unmount()
    await act(async () => { finish(waiting) })
    await waitFor(() => expect(client.ccBus.setRole).toHaveBeenLastCalledWith(CCBusRole.DISABLED))
  })
})
