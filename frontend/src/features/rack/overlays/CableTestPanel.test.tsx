import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CableTestResult } from '../../../lib/device'
import { CableTestPanel } from './CableTestPanel'

const waiting: CableTestResult = {
  generation: 1,
  outcome: 'WAITING',
  vconnContact: 0,
  goodCRC: false,
  revision: 2,
  body: new Uint8Array(),
}

afterEach(() => {
  cleanup()
})

describe('Cable Test panel', () => {
  it('shows cached results without starting hardware commands', () => {
    const body = Uint8Array.from('41A800FF0000601C000000000000000043260A00'.match(/../g)!, (hex) => Number.parseInt(hex, 16))
    const cached: CableTestResult = { ...waiting, outcome: 'IDENTITY', vconnContact: 1, goodCRC: true, body }
    const onRetest = vi.fn()
    const onClose = vi.fn()
    render(
      <CableTestPanel
        initialResult={cached}
        onClose={onClose}
        onRetest={onRetest}
      />,
    )
    expect(screen.getByTestId('cable-test-panel')).toHaveAttribute('data-mode', 'cached')
    expect(screen.getByTestId('cable-test-panel')).toHaveAccessibleName('Cable Test, Port 1')
    expect(screen.getByText('Port 1')).toBeTruthy()
    expect(screen.getByText('E-marked cable detected.')).toBeTruthy()
    expect(screen.getByText('5 A')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    screen.getByRole('button', { name: 'Retest' }).click()
    expect(onRetest).toHaveBeenCalledTimes(1)
    screen.getAllByRole('button', { name: 'Close' })[0].click()
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the empty-state message when the cached snapshot has no identity', () => {
    render(<CableTestPanel initialResult={waiting} onClose={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toBe(
      'No cable detected, damaged cable, or cable without an e-marker. Ensure that the cable is not connected to any device and plug it into Port 1.',
    )
    expect(screen.getByLabelText('USB Vendor ID blank').textContent).toBe('')
    expect(screen.queryByRole('button', { name: 'Retest' })).toBeNull()
  })
})
