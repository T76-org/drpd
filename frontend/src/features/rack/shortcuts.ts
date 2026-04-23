export type RackShortcutId =
  | 'toggle-usb-connection'
  | 'switch-sink'
  | 'switch-observer'
  | 'toggle-capture'
  | 'show-shortcut-help'

export interface RackShortcutDefinition {
  id: RackShortcutId
  key: string
  label: string
  description: string
}

export const RACK_SHORTCUTS: RackShortcutDefinition[] = [
  {
    id: 'toggle-usb-connection',
    key: 'T',
    label: 'Toggle USB connection',
    description: 'Switch to Disabled for 1 second, then restore the previous mode.',
  },
  {
    id: 'switch-sink',
    key: 'S',
    label: 'Switch to Sink',
    description: 'Set the active DRPD mode to Sink.',
  },
  {
    id: 'switch-observer',
    key: 'O',
    label: 'Switch to Observer',
    description: 'Set the active DRPD mode to Observer.',
  },
  {
    id: 'toggle-capture',
    key: 'C',
    label: 'Toggle capture',
    description: 'Turn CC capture on or off.',
  },
  {
    id: 'show-shortcut-help',
    key: '?',
    label: 'Show shortcut help',
    description: 'Open the global shortcut reference.',
  },
]

const TEXT_ENTRY_INPUT_TYPES = new Set([
  '',
  'date',
  'datetime-local',
  'email',
  'month',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'time',
  'url',
  'week',
])

export const isTextEntryShortcutTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
    return true
  }
  const input = target.closest('input')
  if (input) {
    return TEXT_ENTRY_INPUT_TYPES.has(input.type.toLowerCase())
  }
  return target.closest('textarea') != null
}

export const matchRackShortcut = (event: KeyboardEvent): RackShortcutId | null => {
  if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
    return null
  }
  if (isTextEntryShortcutTarget(event.target)) {
    return null
  }

  switch (event.key) {
    case 't':
    case 'T':
      return 'toggle-usb-connection'
    case 's':
    case 'S':
      return 'switch-sink'
    case 'o':
    case 'O':
      return 'switch-observer'
    case 'c':
    case 'C':
      return 'toggle-capture'
    case '?':
      return 'show-shortcut-help'
    default:
      return null
  }
}
