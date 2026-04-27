export type RackShortcutId =
  | 'toggle-usb-connection'
  | 'switch-sink'
  | 'switch-observer'
  | 'switch-disabled'
  | 'toggle-capture'
  | 'reset-accumulator'
  | 'clear-log'
  | 'add-marker'
  | 'toggle-goodcrc'
  | 'filter-log'
  | 'reset-trigger'
  | 'open-user-manual'

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
    id: 'switch-disabled',
    key: 'D',
    label: 'Switch to Disabled',
    description: 'Set the active DRPD mode to Disabled.',
  },
  {
    id: 'toggle-capture',
    key: 'C',
    label: 'Toggle capture',
    description: 'Turn CC capture on or off.',
  },
  {
    id: 'reset-accumulator',
    key: 'Z',
    label: 'Reset accumulator',
    description: 'Reset accumulated charge and energy.',
  },
  {
    id: 'clear-log',
    key: 'X',
    label: 'Clear log',
    description: 'Open the clear log confirmation.',
  },
  {
    id: 'add-marker',
    key: 'M',
    label: 'Add marker',
    description: 'Add a marker to the log.',
  },
  {
    id: 'toggle-goodcrc',
    key: 'G',
    label: 'Show or hide GoodCRC messages',
    description: 'Toggle GoodCRC visibility in the message log.',
  },
  {
    id: 'filter-log',
    key: 'F',
    label: 'Filter log',
    description: 'Open the message log filter dialog.',
  },
  {
    id: 'reset-trigger',
    key: 'R',
    label: 'Reset trigger',
    description: 'Reset the trigger state.',
  },
  {
    id: 'open-user-manual',
    key: '?',
    label: 'User manual',
    description: 'Open the user manual.',
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
    case 'd':
    case 'D':
      return 'switch-disabled'
    case 'c':
    case 'C':
      return 'toggle-capture'
    case 'z':
    case 'Z':
      return 'reset-accumulator'
    case 'x':
    case 'X':
      return 'clear-log'
    case 'm':
    case 'M':
      return 'add-marker'
    case 'g':
    case 'G':
      return 'toggle-goodcrc'
    case 'f':
    case 'F':
      return 'filter-log'
    case 'r':
    case 'R':
      return 'reset-trigger'
    case '?':
      return 'open-user-manual'
    default:
      return null
  }
}
