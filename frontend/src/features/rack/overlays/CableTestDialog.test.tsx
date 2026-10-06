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
  it('groups VDOs in sections and separates raw codes from cable meanings', async () => {
    const client = fakeClient()
    const body = Uint8Array.from('41A800FF0000601C000000000000000043260A00'.match(/../g)!, (hex) => Number.parseInt(hex, 16))
    client.ccBus.getCableTestResult.mockResolvedValue({ ...waiting, outcome: 'IDENTITY', vconnContact: 1, goodCRC: true, body })
    render(<CableTestDialog client={client} onClose={vi.fn()} onError={vi.fn()} />)
    const table = await screen.findByRole('table', { name: 'Cable identity' })
    await waitFor(() => expect(within(table).getByText('Passive Cable VDO')).toBeTruthy())
    for (const title of ['ID Header VDO', 'Cert Stat VDO', 'Product VDO', 'Passive Cable VDO']) {
      expect(within(table).getByText(title).closest('th')?.getAttribute('colspan')).toBe('3')
    }
    expect(within(table).getByRole('columnheader', { name: 'Human-readable result' })).toBeTruthy()
    expect(within(table).getAllByRole('columnheader').slice(0, 3).map((cell) => cell.textContent)).toEqual(['Field', 'Human-readable result', 'Raw value'])
    for (const [field, raw, meaning] of [
      ['VBUS Current Handling Capability', '0b10', '5 A'],
      ['Maximum VBUS Voltage', '0b11', '50 V'],
      ['USB Highest Speed', '0b011', 'USB4 Gen3'],
      ['SOP Product Type (UFP/Cable)', '0b011', 'Passive Cable'],
      ['USB Host Capable', '0', 'No'],
    ]) {
      const row = within(table).getByRole('rowheader', { name: field }).closest('tr')!
      expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([meaning, raw])
    }
  })
  it('starts standalone test, gives exact empty message, stops on unmount', async () => {
    const client = fakeClient()
    const view = render(<CableTestDialog client={client} onClose={vi.fn()} onError={vi.fn()} />)
    await waitFor(() => expect(client.ccBus.getCableTestResult).toHaveBeenCalled())
    expect(screen.getByText('no cable present or cable damaged')).toBeTruthy()
    expect(screen.getByLabelText('Vendor ID blank').textContent).toBe('')
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
    expect(screen.getByText('0x1234')).toBeTruthy()
    expect(screen.getByText(/E-marker identity received/)).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    expect(screen.queryByText('0x1234')).toBeNull()
    expect(screen.getByLabelText('Vendor ID blank').textContent).toBe('')
  })
  it('does not treat Ra timeout as proof of missing marker', async () => {
    const client = fakeClient()
    client.ccBus.getCableTestResult.mockResolvedValue({ ...waiting, outcome: 'NO_RESPONSE', vconnContact: 1 })
    render(<CableTestDialog client={client} onClose={vi.fn()} onError={vi.fn()} />)
    expect(await screen.findByText(/e-marker is not responding/)).toBeTruthy()
    expect(screen.getByLabelText('Vendor ID blank').textContent).toBe('')
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
