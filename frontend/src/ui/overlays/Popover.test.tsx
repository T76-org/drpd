import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  Popover,
  PopoverButton,
  PopoverButtonRow,
  PopoverForm,
  PopoverFormRow,
  PopoverInput,
  PopoverSection,
  PopoverText,
} from './Popover'

const renderPopover = () => {
  render(
    <div>
      <Popover
        label="Settings"
        trigger={(props) => (
          <button type="button" {...props}>
            Configure
          </button>
        )}
      >
        <PopoverSection title="Controls">
          <PopoverText>Tune the current instrument.</PopoverText>
          <PopoverForm>
            <PopoverFormRow
              label="Name"
              htmlFor="settings-name"
              helpText="Visible label"
              errorText="Name is required"
            >
              <PopoverInput id="settings-name" defaultValue="DRPD" />
            </PopoverFormRow>
          </PopoverForm>
          <PopoverButtonRow>
            <PopoverButton>Cancel</PopoverButton>
            <PopoverButton variant="primary">Apply</PopoverButton>
          </PopoverButtonRow>
        </PopoverSection>
      </Popover>
      <button type="button">Outside</button>
    </div>,
  )
}

describe('Popover', () => {
  it('opens a dialog below the trigger with shared form primitives', async () => {
    const user = userEvent.setup()
    renderPopover()

    await user.click(screen.getByRole('button', { name: 'Configure' }))

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Controls' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('DRPD')
    expect(screen.getByText('Visible label')).toBeInTheDocument()
    expect(screen.getByText('Name is required')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument()
  })

  it('dismisses with Escape', async () => {
    const user = userEvent.setup()
    renderPopover()

    await user.click(screen.getByRole('button', { name: 'Configure' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Configure' })).toHaveFocus()
  })

  it('does not dismiss on outside click', async () => {
    const user = userEvent.setup()
    renderPopover()

    await user.click(screen.getByRole('button', { name: 'Configure' }))
    await user.click(screen.getByRole('button', { name: 'Outside' }))

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  })
})
