import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MessageLogFilterPopover } from './MessageLogFilterPopover'
import type { MessageLogFilters } from './usbPdLogFilters'

const emptyFilters = (): MessageLogFilters => ({
  messageTypes: { include: [], exclude: [] },
  senders: { include: [], exclude: [] },
  receivers: { include: [], exclude: [] },
  sopTypes: { include: [], exclude: [] },
  crcValid: { include: [], exclude: [] },
})

const options = {
  messageTypes: [
    { value: 'GoodCRC', label: 'GoodCRC' },
    { value: 'Accept', label: 'Accept' },
  ],
  senders: [{ value: 'Source', label: 'Source' }],
  receivers: [{ value: 'Sink', label: 'Sink' }],
  sopTypes: [{ value: 'SOP', label: 'SOP' }],
  crcValid: [{ value: 'Valid', label: 'Valid' }],
}

describe('MessageLogFilterPopover', () => {
  it('applies unchecked options as exclude filters', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <MessageLogFilterPopover
        open
        onOpenChange={onOpenChange}
        filters={emptyFilters()}
        options={options}
        onApply={onApply}
        onClear={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Accept' }))
    await user.click(screen.getByRole('checkbox', { name: 'Source' }))
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onApply).toHaveBeenCalledWith({
      messageTypes: { include: [], exclude: ['Accept'] },
      senders: { include: [], exclude: ['Source'] },
      receivers: { include: [], exclude: [] },
      sopTypes: { include: [], exclude: [] },
      crcValid: { include: [], exclude: [] },
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('initializes legacy include filters as checked-only values', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()

    render(
      <MessageLogFilterPopover
        open
        onOpenChange={vi.fn()}
        filters={{
          ...emptyFilters(),
          messageTypes: { include: ['Accept'], exclude: [] },
        }}
        options={options}
        onApply={onApply}
        onClear={vi.fn()}
      />,
    )

    expect(screen.queryByRole('checkbox', { name: 'GoodCRC' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Accept' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Hide GoodCRC messages' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onApply).toHaveBeenCalledWith({
      messageTypes: { include: [], exclude: ['GoodCRC'] },
      senders: { include: [], exclude: [] },
      receivers: { include: [], exclude: [] },
      sopTypes: { include: [], exclude: [] },
      crcValid: { include: [], exclude: [] },
    })
  })

  it('keeps GoodCRC out of Message type and applies the bottom checkbox', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()

    render(
      <MessageLogFilterPopover
        open
        onOpenChange={vi.fn()}
        filters={emptyFilters()}
        options={options}
        onApply={onApply}
        onClear={vi.fn()}
      />,
    )

    const messageTypeGroup = screen.getByRole('group', { name: 'Message type' })
    expect(within(messageTypeGroup).queryByRole('checkbox', { name: 'GoodCRC' }))
      .not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Hide GoodCRC messages' })).not.toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: 'Hide GoodCRC messages' }))
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onApply).toHaveBeenCalledWith({
      messageTypes: { include: [], exclude: ['GoodCRC'] },
      senders: { include: [], exclude: [] },
      receivers: { include: [], exclude: [] },
      sopTypes: { include: [], exclude: [] },
      crcValid: { include: [], exclude: [] },
    })
  })

  it('submits the current filters when Enter is pressed', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <MessageLogFilterPopover
        open
        onOpenChange={onOpenChange}
        filters={emptyFilters()}
        options={options}
        onApply={onApply}
        onClear={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Accept' }))
    await user.keyboard('{Enter}')

    expect(onApply).toHaveBeenCalledWith({
      messageTypes: { include: [], exclude: ['Accept'] },
      senders: { include: [], exclude: [] },
      receivers: { include: [], exclude: [] },
      sopTypes: { include: [], exclude: [] },
      crcValid: { include: [], exclude: [] },
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('clears filters and closes the dialog', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <MessageLogFilterPopover
        open
        onOpenChange={onOpenChange}
        filters={{
          ...emptyFilters(),
          messageTypes: { include: [], exclude: ['GoodCRC'] },
        }}
        options={options}
        onApply={vi.fn()}
        onClear={onClear}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
