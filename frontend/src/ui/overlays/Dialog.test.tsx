import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import {
  Dialog,
  DialogButton,
  DialogForm,
  DialogFormRow,
  DialogInput,
} from './Dialog'

const DialogHarness = ({ dismissible = true }: { dismissible?: boolean }) => {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Rack settings"
        description="Adjust shared rack metadata."
        dismissible={dismissible}
        footer={
          <>
            <DialogButton onClick={() => setOpen(false)}>Cancel</DialogButton>
            <DialogButton variant="primary" onClick={() => setOpen(false)}>
              Save
            </DialogButton>
          </>
        }
      >
        <DialogForm>
          <DialogFormRow
            label="Name"
            htmlFor="rack-name"
            helpText="Visible rack name"
            errorText="Name is required"
          >
            <DialogInput id="rack-name" defaultValue="Rack" />
          </DialogFormRow>
        </DialogForm>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('renders centered modal content with shared form primitives', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)

    await user.click(screen.getByRole('button', { name: 'Open dialog' }))

    const dialog = screen.getByRole('dialog', { name: 'Rack settings' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Adjust shared rack metadata.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Rack')
    expect(screen.getByText('Visible rack name')).toBeInTheDocument()
    expect(screen.getByText('Name is required')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('dismisses with Escape and returns focus', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)

    await user.click(screen.getByRole('button', { name: 'Open dialog' }))
    await user.keyboard('{Escape}')

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Rack settings' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Open dialog' })).toHaveFocus()
  })

  it('dismisses on backdrop click when dismissible', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)

    await user.click(screen.getByRole('button', { name: 'Open dialog' }))
    await user.click(document.querySelector('[data-floating-ui-scroll-lock]') ?? document.body)

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Rack settings' })).not.toBeInTheDocument(),
    )
  })

  it('does not dismiss unsafe flows when dismissible is false', async () => {
    const user = userEvent.setup()
    render(<DialogHarness dismissible={false} />)

    await user.click(screen.getByRole('button', { name: 'Open dialog' }))
    await user.keyboard('{Escape}')
    await user.click(document.querySelector('[data-floating-ui-scroll-lock]') ?? document.body)

    expect(screen.getByRole('dialog', { name: 'Rack settings' })).toBeInTheDocument()
  })
})
