import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MessageLogClearPopover } from './LogActionPopovers'
import styles from './LogActionPopovers.module.css'

describe('MessageLogClearPopover', () => {
  it('shows a deliberate confirmation hierarchy before clearing logs', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()

    render(
      <MessageLogClearPopover
        open
        onOpenChange={vi.fn()}
        clearError={null}
        isClearing={false}
        onCancel={vi.fn()}
        onClear={onClear}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Clear logs' })

    expect(within(dialog).getByRole('heading', { name: 'Are you sure?' }))
      .toHaveClass(styles.clearQuestion)
    expect(
      within(dialog).getByText('This will permanently delete all logged messages and analog samples.'),
    ).toHaveClass(styles.clearWarning)

    await user.click(within(dialog).getByRole('button', { name: 'Clear' }))

    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
