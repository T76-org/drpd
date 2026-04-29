import { useMemo, useState } from 'react'
import { Menu, type MenuItem } from './Menu'

/**
 * Isolated minimal menu example for local development and tests.
 */
export const MenuExample = () => {
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [lastAction, setLastAction] = useState('None')

  const items = useMemo<MenuItem[]>(
    () => [
      {
        id: 'rename',
        label: 'Rename',
        meta: 'R',
        onSelect: () => setLastAction('Rename'),
      },
      {
        id: 'snap',
        type: 'checkbox',
        label: 'Snap to grid',
        checked: snapEnabled,
        onCheckedChange: setSnapEnabled,
      },
      {
        id: 'display',
        type: 'submenu',
        label: 'Display',
        items: [
          {
            id: 'compact',
            label: 'Compact',
            onSelect: () => setLastAction('Compact'),
          },
          {
            id: 'show-labels',
            type: 'checkbox',
            label: 'Show labels',
            checked: true,
            onCheckedChange: () => setLastAction('Toggle labels'),
          },
        ],
      },
    ],
    [snapEnabled],
  )

  return (
    <div>
      <Menu
        label="Example actions"
        items={items}
        trigger={(props) => (
          <button type="button" {...props}>
            Actions
          </button>
        )}
      />
      <output aria-label="Last action">{lastAction}</output>
    </div>
  )
}
