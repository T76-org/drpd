import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Menu, type MenuItem } from './Menu'

const renderMenu = (items: MenuItem[]) => {
  render(
    <Menu
      label="Test menu"
      items={items}
      trigger={(props) => (
        <button type="button" {...props}>
          Open menu
        </button>
      )}
    />,
  )
}

describe('Menu', () => {
  it('opens below trigger with menu roles', async () => {
    const user = userEvent.setup()
    renderMenu([
      {
        id: 'open',
        label: 'Open',
        onSelect: vi.fn(),
      },
    ])

    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    const menu = screen.getByRole('menu', { name: 'Test menu' })
    expect(menu).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Open' })).toBeInTheDocument()
  })

  it('selects actions with Enter and closes with Escape', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderMenu([
      {
        id: 'open',
        label: 'Open',
        onSelect,
      },
    ])

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu', { name: 'Test menu' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu', { name: 'Test menu' })).not.toBeInTheDocument()
  })

  it('does not leave focus on the trigger after closing with Escape', async () => {
    const user = userEvent.setup()
    renderMenu([
      {
        id: 'open',
        label: 'Open',
        onSelect: vi.fn(),
      },
    ])

    const trigger = screen.getByRole('button', { name: 'Open menu' })
    await user.click(trigger)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu', { name: 'Test menu' })).not.toBeInTheDocument()
    expect(trigger).not.toHaveFocus()
  })

  it('supports checkbox items and closes the menu', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    renderMenu([
      {
        id: 'snap',
        type: 'checkbox',
        label: 'Snap to grid',
        checked: false,
        onCheckedChange,
      },
    ])

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Snap to grid' }))

    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(screen.queryByRole('menu', { name: 'Test menu' })).not.toBeInTheDocument()
  })

  it('supports one nested submenu level with keyboard navigation', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onParentSelect = vi.fn()
    const onComfortableSelect = vi.fn()
    renderMenu([
      {
        id: 'rename',
        label: 'Rename',
        onSelect: onParentSelect,
      },
      {
        id: 'display',
        type: 'submenu',
        label: 'Display',
        items: [
          {
            id: 'compact',
            label: 'Compact',
            onSelect,
          },
          {
            id: 'comfortable',
            label: 'Comfortable',
            onSelect: onComfortableSelect,
          },
        ],
      },
    ])

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowRight}')
    expect(await screen.findByRole('menu', { name: 'Display submenu' })).toBeInTheDocument()
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onComfortableSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onParentSelect).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu', { name: 'Test menu' })).not.toBeInTheDocument()
  })

  it('supports two nested submenu levels with keyboard navigation', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderMenu([
      {
        id: 'devices',
        type: 'submenu',
        label: 'Devices',
        items: [
          {
            id: 'current-device',
            type: 'submenu',
            label: 'Current device: ABC123',
            items: [
              {
                id: 'disconnect',
                label: 'Disconnect',
                onSelect,
              },
            ],
          },
        ],
      },
    ])

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.keyboard('{ArrowRight}')
    expect(await screen.findByRole('menu', { name: 'Devices submenu' })).toBeInTheDocument()
    await user.keyboard('{ArrowRight}')
    expect(
      await screen.findByRole('menu', { name: 'Current device: ABC123 submenu' }),
    ).toBeInTheDocument()
    await user.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu', { name: 'Test menu' })).not.toBeInTheDocument()
  })
})
