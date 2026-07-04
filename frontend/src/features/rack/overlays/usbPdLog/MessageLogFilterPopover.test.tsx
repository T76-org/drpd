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
    { value: 'Reject', label: 'Reject' },
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
      />,
    )

    await user.selectOptions(screen.getByLabelText('Included message types'), 'Accept')
    await user.click(screen.getByRole('button', { name: '>>' }))
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
      />,
    )

    expect(screen.queryByRole('checkbox', { name: 'GoodCRC' })).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('Included message types')).getByRole('option', { name: 'Accept' }))
      .toBeInTheDocument()
    expect(within(screen.getByLabelText('Excluded message types')).getByRole('option', { name: 'Reject' }))
      .toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Hide GoodCRC messages' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onApply).toHaveBeenCalledWith({
      messageTypes: { include: [], exclude: ['Reject', 'GoodCRC'] },
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
      />,
    )

    const messageTypeGroup = screen.getByRole('group', { name: 'Message type' })
    expect(within(messageTypeGroup).queryByRole('option', { name: 'GoodCRC' }))
      .not.toBeInTheDocument()
    expect(within(messageTypeGroup).getByLabelText('Included message types')).toBeInTheDocument()
    expect(within(messageTypeGroup).getByLabelText('Excluded message types')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Hide GoodCRC messages' })).not.toBeChecked()

    await user.selectOptions(screen.getByLabelText('Included message types'), 'Accept')
    await user.click(screen.getByRole('button', { name: '>>' }))
    expect(within(screen.getByLabelText('Excluded message types')).getByRole('option', { name: 'Accept' }))
      .toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Excluded message types'), 'Accept')
    await user.click(screen.getByRole('button', { name: '<<' }))
    expect(within(screen.getByLabelText('Included message types')).getByRole('option', { name: 'Accept' }))
      .toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Included message types'), 'Accept')
    await user.dblClick(within(screen.getByLabelText('Included message types')).getByRole('option', { name: 'Accept' }))
    await user.click(screen.getByRole('checkbox', { name: 'Hide GoodCRC messages' }))
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onApply).toHaveBeenCalledWith({
      messageTypes: { include: [], exclude: ['Accept', 'GoodCRC'] },
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
      />,
    )

    await user.selectOptions(screen.getByLabelText('Included message types'), 'Accept')
    await user.click(screen.getByRole('button', { name: '>>' }))
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

  it('restores default filters across all groups', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()

    render(
      <MessageLogFilterPopover
        open
        onOpenChange={vi.fn()}
        filters={{
          ...emptyFilters(),
          messageTypes: { include: [], exclude: ['Accept', 'GoodCRC'] },
          senders: { include: [], exclude: ['Source'] },
          receivers: { include: [], exclude: ['Sink'] },
        }}
        options={options}
        onApply={onApply}
      />,
    )

    expect(screen.getByRole('checkbox', { name: 'Hide GoodCRC messages' })).toBeChecked()
    expect(within(screen.getByLabelText('Excluded message types')).getByRole('option', { name: 'Accept' }))
      .toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Source' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Sink' })).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Restore defaults' }))
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Filter message log' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Hide GoodCRC messages' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Source' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Sink' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onApply).toHaveBeenCalledWith({
      messageTypes: { include: [], exclude: [] },
      senders: { include: [], exclude: [] },
      receivers: { include: [], exclude: [] },
      sopTypes: { include: [], exclude: [] },
      crcValid: { include: [], exclude: [] },
    })
  })

  it('does not show a message type restore button', () => {
    render(
      <MessageLogFilterPopover
        open
        onOpenChange={vi.fn()}
        filters={emptyFilters()}
        options={options}
        onApply={vi.fn()}
      />,
    )

    expect(within(screen.getByRole('group', { name: 'Message type' }))
      .queryByRole('button', { name: 'Restore defaults' }))
      .not.toBeInTheDocument()
  })
})
