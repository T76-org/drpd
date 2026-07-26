import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DRPDDriverRuntime } from '../../../../lib/device'
import {
  BMCDecoderConfigurationDialog,
  BMCDecoderConfigurationSafetyDialog,
} from './BMCDecoderConfigurationDialogs'

const target = { recordId: 'device-1', deviceName: 'Bench Dr. PD' }

const createDriver = () => {
  const bmcDecoder = {
    getCCVrefVoltage: vi.fn().mockResolvedValue(0.4),
    setCCVrefVoltage: vi.fn().mockResolvedValue(undefined),
    resetCCVrefVoltage: vi.fn().mockResolvedValue(undefined),
    getCCVrefPwmFrequencyHz: vi.fn().mockResolvedValue(100000),
    setCCVrefPwmFrequencyHz: vi.fn().mockResolvedValue(undefined),
    resetCCVrefPwmFrequencyHz: vi.fn().mockResolvedValue(undefined),
  }
  return {
    bmcDecoder,
    driver: { system: { configuration: { bmcDecoder } } } as unknown as DRPDDriverRuntime,
  }
}

describe('BMC decoder configuration dialogs', () => {
  it('requires explicit safety confirmation and exposes warning suppression', async () => {
    const onConfirm = vi.fn()
    const onSuppressWarningChange = vi.fn()
    render(
      <BMCDecoderConfigurationSafetyDialog
        target={target}
        suppressWarning={false}
        onSuppressWarningChange={onSuppressWarningChange}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Warning' })
    expect(within(dialog).queryByText(/Bench Dr\. PD/)).not.toBeInTheDocument()
    expect(within(dialog).getByText(/changing internal settings/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/render it inoperable/i)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('checkbox'))
    expect(onSuppressWarningChange).toHaveBeenCalledWith(true)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('loads values, stages defaults, and applies only changed settings', async () => {
    const { bmcDecoder, driver } = createDriver()
    const onOpenChange = vi.fn()
    render(
      <BMCDecoderConfigurationDialog
        target={target}
        driver={driver}
        onOpenChange={onOpenChange}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Internal Settings' })
    expect(within(dialog).queryByText(/Bench Dr\. PD physical-layer settings/)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('tab', { name: 'BMC Decoder' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await screen.findByDisplayValue('0.40')
    const resetButtons = within(dialog).getAllByRole('button', { name: 'Reset' })
    await userEvent.click(resetButtons[0])
    expect(within(dialog).getByLabelText('CC reference voltage (V)')).toHaveValue(0.7)
    expect(bmcDecoder.setCCVrefVoltage).not.toHaveBeenCalled()

    const frequencyInput = within(dialog).getByLabelText('VREF PWM frequency (Hz)')
    await userEvent.clear(frequencyInput)
    await userEvent.type(frequencyInput, '101000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'OK' }))

    await waitFor(() => expect(bmcDecoder.setCCVrefPwmFrequencyHz).toHaveBeenCalledWith(101000))
    expect(bmcDecoder.resetCCVrefVoltage).toHaveBeenCalledOnce()
    expect(bmcDecoder.setCCVrefVoltage).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('blocks invalid grid values and Cancel performs no writes', async () => {
    const { bmcDecoder, driver } = createDriver()
    const onOpenChange = vi.fn()
    render(
      <BMCDecoderConfigurationDialog
        target={target}
        driver={driver}
        onOpenChange={onOpenChange}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Internal Settings' })
    const voltageInput = await within(dialog).findByLabelText('CC reference voltage (V)')
    await userEvent.clear(voltageInput)
    await userEvent.type(voltageInput, '0.23')
    expect(within(dialog).getByRole('button', { name: 'OK' })).toBeDisabled()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('0.05 V increments')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(bmcDecoder.setCCVrefVoltage).not.toHaveBeenCalled()
    expect(bmcDecoder.setCCVrefPwmFrequencyHz).not.toHaveBeenCalled()
  })

  it('closes with Escape without writing settings', async () => {
    const { bmcDecoder, driver } = createDriver()
    const onOpenChange = vi.fn()
    render(
      <BMCDecoderConfigurationDialog
        target={target}
        driver={driver}
        onOpenChange={onOpenChange}
      />,
    )

    await screen.findByDisplayValue('0.40')
    await userEvent.keyboard('{Escape}')

    expect(onOpenChange).toHaveBeenCalled()
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false)
    expect(bmcDecoder.setCCVrefVoltage).not.toHaveBeenCalled()
    expect(bmcDecoder.setCCVrefPwmFrequencyHz).not.toHaveBeenCalled()
  })
})
