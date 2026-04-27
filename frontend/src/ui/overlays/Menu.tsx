import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  type Placement,
} from '@floating-ui/react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import styles from './Menu.module.css'

type MenuBaseItem = {
  ///< Stable item identifier used for focus and submenu ownership.
  id: string
  ///< Visible item label.
  label: ReactNode
  ///< Optional right-aligned hint such as a shortcut.
  meta?: ReactNode
  ///< Disable pointer and keyboard selection.
  disabled?: boolean
}

export type MenuActionItem = MenuBaseItem & {
  type?: 'item'
  destructive?: boolean
  onSelect: () => void
}

export type MenuCheckboxItem = MenuBaseItem & {
  type: 'checkbox'
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export type MenuSeparatorItem = {
  type: 'separator'
  id: string
}

export type MenuLeafItem = MenuActionItem | MenuCheckboxItem | MenuSeparatorItem

export type MenuNestedSubmenuItem = MenuBaseItem & {
  type: 'submenu'
  items: MenuLeafItem[]
}

export type NestedMenuItem =
  | MenuActionItem
  | MenuCheckboxItem
  | MenuSeparatorItem
  | MenuNestedSubmenuItem

export type MenuSubmenuItem = MenuBaseItem & {
  type: 'submenu'
  items: NestedMenuItem[]
}

export type MenuItem = MenuActionItem | MenuCheckboxItem | MenuSeparatorItem | MenuSubmenuItem

export type MenuTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref: (node: HTMLButtonElement | null) => void
}

export type MenuProps = {
  ///< Accessible name for the menu.
  label: string
  ///< Render a trigger button. Spread the provided props onto the button.
  trigger: (props: MenuTriggerProps) => ReactElement
  ///< Root items. Submenus support two nested levels.
  items: MenuItem[]
  ///< Preferred horizontal alignment below the trigger.
  align?: 'start' | 'end'
  ///< Called whenever menu open state changes.
  onOpenChange?: (open: boolean) => void
}

const MENU_OFFSET_PX = 0
const MENU_VIEWPORT_PADDING_PX = 8
const MIN_MENU_HEIGHT_PX = 120

type SelectableMenuItem =
  | MenuActionItem
  | MenuCheckboxItem
  | MenuSubmenuItem
  | MenuNestedSubmenuItem

const isSelectableItem = (item: MenuItem | NestedMenuItem | MenuLeafItem): item is SelectableMenuItem =>
  item.type !== 'separator'

const isSubmenuItem = (item: MenuItem | NestedMenuItem): item is MenuSubmenuItem | MenuNestedSubmenuItem =>
  item.type === 'submenu'

const getNextEnabledIndex = (
  items: Array<MenuItem | NestedMenuItem>,
  currentIndex: number,
  direction: 1 | -1,
) => {
  const selectableItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isSelectableItem(item) && !item.disabled)

  if (selectableItems.length === 0) {
    return -1
  }

  const currentSelectableIndex = selectableItems.findIndex(({ index }) => index === currentIndex)
  const nextSelectableIndex =
    currentSelectableIndex === -1
      ? direction === 1
        ? 0
        : selectableItems.length - 1
      : (currentSelectableIndex + direction + selectableItems.length) % selectableItems.length

  return selectableItems[nextSelectableIndex]?.index ?? -1
}

const getFirstEnabledIndex = (items: Array<MenuItem | NestedMenuItem>) =>
  getNextEnabledIndex(items, -1, 1)

const getLastEnabledIndex = (items: Array<MenuItem | NestedMenuItem>) =>
  getNextEnabledIndex(items, 0, -1)

const activateNestedMenuItem = (
  item: NestedMenuItem | undefined,
  onRequestClose: () => void,
) => {
  if (!item || !isSelectableItem(item) || item.disabled) {
    return
  }
  if (item.type === 'checkbox') {
    item.onCheckedChange(!item.checked)
    onRequestClose()
    return
  }
  if (item.type === 'submenu') {
    activateLeafMenuItem(item.items[getFirstEnabledIndex(item.items)], onRequestClose)
    return
  }
  item.onSelect()
  onRequestClose()
}

const activateLeafMenuItem = (
  item: MenuLeafItem | undefined,
  onRequestClose: () => void,
) => {
  if (!item || !isSelectableItem(item) || item.disabled) {
    return
  }
  if (item.type === 'checkbox') {
    item.onCheckedChange(!item.checked)
    onRequestClose()
    return
  }
  item.onSelect()
  onRequestClose()
}

const makeSizeMiddleware = () =>
  size({
    padding: MENU_VIEWPORT_PADDING_PX,
    apply({ availableHeight, availableWidth, elements }) {
      Object.assign(elements.floating.style, {
        maxHeight: `${Math.max(MIN_MENU_HEIGHT_PX, availableHeight)}px`,
        maxWidth: `${Math.max(160, availableWidth)}px`,
      })
    },
  })

/**
 * Reusable floating menu with viewport-aware placement, nested two-level submenus,
 * checkbox items, and keyboard navigation.
 */
export const Menu = ({
  label,
  trigger,
  items,
  align = 'start',
  onOpenChange,
}: MenuProps) => {
  const [open, setOpen] = useState(false)
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null)
  const [focusFirstSubmenuId, setFocusFirstSubmenuId] = useState<string | null>(null)
  const [forceOpenFirstNestedSubmenuId, setForceOpenFirstNestedSubmenuId] = useState<string | null>(
    null,
  )
  const [activeRootIndex, setActiveRootIndex] = useState(-1)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const rootItemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const placement: Placement = align === 'end' ? 'bottom-end' : 'bottom-start'
  const { refs, floatingStyles, context } = useFloating<HTMLButtonElement>({
    open,
    onOpenChange(nextOpen) {
      setOpen(nextOpen)
      onOpenChange?.(nextOpen)
      if (!nextOpen) {
        setOpenSubmenuId(null)
        setFocusFirstSubmenuId(null)
        setForceOpenFirstNestedSubmenuId(null)
        setActiveRootIndex(-1)
      }
    },
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(MENU_OFFSET_PX),
      flip({ padding: MENU_VIEWPORT_PADDING_PX }),
      shift({ padding: MENU_VIEWPORT_PADDING_PX }),
      makeSizeMiddleware(),
    ],
  })

  const click = useClick(context)
  const dismiss = useDismiss(context, { escapeKey: true })
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss])

  const closeMenu = useCallback(() => {
    setOpen(false)
    setOpenSubmenuId(null)
    setFocusFirstSubmenuId(null)
    setForceOpenFirstNestedSubmenuId(null)
    setActiveRootIndex(-1)
    triggerRef.current?.focus()
    onOpenChange?.(false)
  }, [onOpenChange])

  const focusRootItem = useCallback((index: number) => {
    if (index < 0) {
      return
    }
    setActiveRootIndex(index)
    rootItemRefs.current[index]?.focus()
  }, [])

  const activateRootItem = useCallback(
    (index: number) => {
      const item = items[index]
      if (!item || !isSelectableItem(item) || item.disabled) {
        return
      }
      if (item.type === 'checkbox') {
        item.onCheckedChange(!item.checked)
        closeMenu()
        return
      }
      if (item.type === 'submenu') {
        if (openSubmenuId === item.id) {
          activateNestedMenuItem(item.items[getFirstEnabledIndex(item.items)], closeMenu)
          return
        }
        setFocusFirstSubmenuId(item.id)
        setOpenSubmenuId(item.id)
        return
      }
      item.onSelect()
      closeMenu()
    },
    [closeMenu, items, openSubmenuId],
  )

  const handleRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      focusRootItem(getNextEnabledIndex(items, activeRootIndex, direction))
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      focusRootItem(getFirstEnabledIndex(items))
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      focusRootItem(getLastEnabledIndex(items))
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const focusedIndex = rootItemRefs.current.findIndex((node) => node === document.activeElement)
      activateRootItem(focusedIndex === -1 ? activeRootIndex : focusedIndex)
      return
    }

    if (event.key === 'ArrowRight') {
      const focusedIndex = rootItemRefs.current.findIndex((node) => node === document.activeElement)
      const item = items[focusedIndex === -1 ? activeRootIndex : focusedIndex]
      if (!item || !isSubmenuItem(item) || item.disabled) {
        return
      }
      event.preventDefault()
      setFocusFirstSubmenuId(item.id)
      setOpenSubmenuId(item.id)
    }
  }

  const referenceProps = getReferenceProps({
    ref(node: HTMLButtonElement | null) {
      triggerRef.current = node
      refs.setReference(node)
    },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    onKeyDown(event) {
      if (!open) {
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        focusRootItem(getNextEnabledIndex(items, activeRootIndex, direction))
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        const itemIndex = activeRootIndex === -1 ? getFirstEnabledIndex(items) : activeRootIndex
        const item = items[itemIndex]
      if (item && isSubmenuItem(item) && !item.disabled) {
          setFocusFirstSubmenuId(item.id)
          if (openSubmenuId === item.id) {
            setForceOpenFirstNestedSubmenuId(item.id)
          } else {
            setOpenSubmenuId(item.id)
          }
        }
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        activateRootItem(activeRootIndex === -1 ? getFirstEnabledIndex(items) : activeRootIndex)
      }
    },
  }) as unknown as MenuTriggerProps

  const triggerElement = trigger(referenceProps)

  return (
    <>
      {triggerElement}
      {open ? (
        <FloatingPortal>
          <div
            {...getFloatingProps({
              ref: refs.setFloating,
              className: styles.menu,
              style: floatingStyles,
              role: 'menu',
              'aria-label': label,
              onKeyDown: handleRootKeyDown,
            })}
          >
            {items.map((item, index) => (
              <MenuItemButton
                key={item.id}
                item={item}
                itemIndex={index}
                active={activeRootIndex === index}
                setItemRef={(node) => {
                  rootItemRefs.current[index] = node
                }}
                onFocus={() => {
                  setActiveRootIndex(index)
                  if (!isSubmenuItem(item)) {
                    setOpenSubmenuId(null)
                  }
                }}
                onRequestClose={closeMenu}
                submenuOpen={openSubmenuId === item.id}
                onOpenSubmenu={() => {
                  setFocusFirstSubmenuId(null)
                  setOpenSubmenuId(item.id)
                }}
                onCloseSubmenu={() => {
                  setFocusFirstSubmenuId(null)
                  setOpenSubmenuId(null)
                }}
                focusFirstOnOpen={focusFirstSubmenuId === item.id}
                forceOpenFirstNestedSubmenu={forceOpenFirstNestedSubmenuId === item.id}
              />
            ))}
          </div>
        </FloatingPortal>
      ) : null}
    </>
  )
}

type MenuItemButtonProps = {
  item: MenuItem
  itemIndex: number
  active: boolean
  setItemRef: (node: HTMLButtonElement | null) => void
  onFocus: () => void
  onRequestClose: () => void
  submenuOpen: boolean
  onOpenSubmenu: () => void
  onCloseSubmenu: () => void
  focusFirstOnOpen: boolean
  forceOpenFirstNestedSubmenu: boolean
}

const MenuItemButton = ({
  item,
  itemIndex,
  active,
  setItemRef,
  onFocus,
  onRequestClose,
  submenuOpen,
  onOpenSubmenu,
  onCloseSubmenu,
  focusFirstOnOpen,
  forceOpenFirstNestedSubmenu,
}: MenuItemButtonProps) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  if (item.type === 'separator') {
    return <div className={styles.separator} role="separator" />
  }

  const selectItem = () => {
    if (item.disabled) {
      return
    }
    if (item.type === 'checkbox') {
      item.onCheckedChange(!item.checked)
      onRequestClose()
      return
    }
    if (item.type === 'submenu') {
      onOpenSubmenu()
      return
    }
    item.onSelect()
    onRequestClose()
  }

  const itemClassName = [
    styles.menuItem,
    active ? styles.menuItemActive : '',
    'destructive' in item && item.destructive ? styles.menuItemDestructive : '',
  ]
    .filter(Boolean)
    .join(' ')

  const handlePointerEnter = () => {
    if (item.disabled) {
      return
    }
    buttonRef.current?.focus()
    if (item.type === 'submenu') {
      onOpenSubmenu()
    }
  }

  return (
    <div onPointerEnter={handlePointerEnter}>
      <button
        ref={(node) => {
          buttonRef.current = node
          setItemRef(node)
        }}
        type="button"
        role={item.type === 'checkbox' ? 'menuitemcheckbox' : 'menuitem'}
        aria-checked={item.type === 'checkbox' ? item.checked : undefined}
        aria-haspopup={item.type === 'submenu' ? 'menu' : undefined}
        aria-expanded={item.type === 'submenu' ? submenuOpen : undefined}
        disabled={item.disabled}
        className={itemClassName}
        tabIndex={itemIndex === 0 ? 0 : -1}
        onFocus={onFocus}
        onClick={selectItem}
      >
        <span className={styles.itemIndicator} aria-hidden="true">
          {item.type === 'checkbox' && item.checked ? '✓' : null}
        </span>
        <span className={styles.itemLabel}>{item.label}</span>
        <span className={styles.itemMeta} aria-hidden={item.meta === undefined}>
          {item.type === 'submenu' ? '›' : item.meta}
        </span>
      </button>
      {item.type === 'submenu' && submenuOpen ? (
        <Submenu
          label={`${item.label} submenu`}
          items={item.items}
          parentRef={buttonRef}
          onRequestClose={onRequestClose}
          onCloseSubmenu={onCloseSubmenu}
          focusFirstOnOpen={focusFirstOnOpen}
          forceOpenFirstNestedSubmenu={forceOpenFirstNestedSubmenu}
        />
      ) : null}
    </div>
  )
}

type SubmenuProps = {
  label: string
  items: NestedMenuItem[]
  parentRef: { current: HTMLButtonElement | null }
  onRequestClose: () => void
  onCloseSubmenu: () => void
  focusFirstOnOpen: boolean
  forceOpenFirstNestedSubmenu?: boolean
}

const Submenu = ({
  label,
  items,
  parentRef,
  onRequestClose,
  onCloseSubmenu,
  focusFirstOnOpen,
  forceOpenFirstNestedSubmenu = false,
}: SubmenuProps) => {
  const [activeIndex, setActiveIndex] = useState(-1)
  const [openNestedSubmenuId, setOpenNestedSubmenuId] = useState<string | null>(null)
  const [focusFirstNestedSubmenuId, setFocusFirstNestedSubmenuId] = useState<string | null>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const didFocusOnOpenRef = useRef(false)
  const { refs, floatingStyles } = useFloating<HTMLButtonElement>({
    open: true,
    placement: 'right-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(MENU_OFFSET_PX),
      flip({ padding: MENU_VIEWPORT_PADDING_PX }),
      shift({ padding: MENU_VIEWPORT_PADDING_PX }),
      makeSizeMiddleware(),
    ],
  })

  useEffect(() => {
    refs.setReference(parentRef.current)
  }, [parentRef, refs])

  useEffect(() => {
    if (!focusFirstOnOpen) {
      didFocusOnOpenRef.current = false
    }
  }, [focusFirstOnOpen])

  const focusItem = (index: number) => {
    if (index < 0) {
      return
    }
    setActiveIndex(index)
    itemRefs.current[index]?.focus()
  }

  useLayoutEffect(() => {
    if (!focusFirstOnOpen) {
      return
    }
    focusItem(getFirstEnabledIndex(items))
  }, [focusFirstOnOpen, items])

  const activateItem = (index: number) => {
    const item = items[index]
    if (item?.type === 'submenu') {
      if (openNestedSubmenuId === item.id) {
        activateLeafMenuItem(item.items[getFirstEnabledIndex(item.items)], onRequestClose)
        return
      }
      setFocusFirstNestedSubmenuId(item.id)
      setOpenNestedSubmenuId(item.id)
      return
    }
    activateNestedMenuItem(item, onRequestClose)
  }

  useEffect(() => {
    if (!forceOpenFirstNestedSubmenu) {
      return
    }
    const firstNestedSubmenu = items.find((item) => item.type === 'submenu' && !item.disabled)
    if (firstNestedSubmenu?.type !== 'submenu') {
      return
    }
    setOpenNestedSubmenuId(firstNestedSubmenu.id)
    setFocusFirstNestedSubmenuId(firstNestedSubmenu.id)
  }, [forceOpenFirstNestedSubmenu, items])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onRequestClose()
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      event.stopPropagation()
      setOpenNestedSubmenuId(null)
      onCloseSubmenu()
      parentRef.current?.focus()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      focusItem(getNextEnabledIndex(items, activeIndex, direction))
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      event.stopPropagation()
      focusItem(getFirstEnabledIndex(items))
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      event.stopPropagation()
      focusItem(getLastEnabledIndex(items))
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      const focusedIndex = itemRefs.current.findIndex((node) => node === document.activeElement)
      activateItem(focusedIndex === -1 ? activeIndex : focusedIndex)
      return
    }

    if (event.key === 'ArrowRight') {
      const focusedIndex = itemRefs.current.findIndex((node) => node === document.activeElement)
      const item = items[focusedIndex === -1 ? activeIndex : focusedIndex]
      if (!item || !isSubmenuItem(item) || item.disabled) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setFocusFirstNestedSubmenuId(item.id)
      setOpenNestedSubmenuId(item.id)
    }
  }

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        className={styles.menu}
        style={floatingStyles}
        role="menu"
        aria-label={label}
        onKeyDown={handleKeyDown}
      >
        {items.map((item, index) =>
          item.type === 'separator' ? (
            <div key={item.id} className={styles.separator} role="separator" />
          ) : (
            <NestedMenuButton
              key={item.id}
              item={item}
              itemIndex={index}
              active={activeIndex === index}
              setItemRef={(node) => {
                itemRefs.current[index] = node
                if (
                  node &&
                  focusFirstOnOpen &&
                  !didFocusOnOpenRef.current &&
                  index === getFirstEnabledIndex(items)
                ) {
                  didFocusOnOpenRef.current = true
                  node.focus()
                }
              }}
              onFocus={() => {
                setActiveIndex(index)
                if (!isSubmenuItem(item)) {
                  setOpenNestedSubmenuId(null)
                }
              }}
              onRequestClose={onRequestClose}
              submenuOpen={openNestedSubmenuId === item.id}
              onOpenSubmenu={() => {
                setFocusFirstNestedSubmenuId(null)
                setOpenNestedSubmenuId(item.id)
              }}
              onCloseSubmenu={() => {
                setFocusFirstNestedSubmenuId(null)
                setOpenNestedSubmenuId(null)
              }}
              focusFirstOnOpen={focusFirstNestedSubmenuId === item.id}
            />
          ),
        )}
      </div>
    </FloatingPortal>
  )
}

type NestedMenuButtonProps = {
  item: NestedMenuItem
  itemIndex: number
  active: boolean
  setItemRef: (node: HTMLButtonElement | null) => void
  onFocus: () => void
  onRequestClose: () => void
  submenuOpen: boolean
  onOpenSubmenu: () => void
  onCloseSubmenu: () => void
  focusFirstOnOpen: boolean
}

const NestedMenuButton = ({
  item,
  itemIndex,
  active,
  setItemRef,
  onFocus,
  onRequestClose,
  submenuOpen,
  onOpenSubmenu,
  onCloseSubmenu,
  focusFirstOnOpen,
}: NestedMenuButtonProps) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  if (item.type === 'separator') {
    return <div className={styles.separator} role="separator" />
  }

  const selectItem = () => {
    if (item.disabled) {
      return
    }
  if (item.type === 'checkbox') {
    item.onCheckedChange(!item.checked)
    onRequestClose()
    return
  }
    if (item.type === 'submenu') {
      onOpenSubmenu()
      return
    }
    item.onSelect()
    onRequestClose()
  }

  const itemClassName = [
    styles.menuItem,
    active ? styles.menuItemActive : '',
    'destructive' in item && item.destructive ? styles.menuItemDestructive : '',
  ]
    .filter(Boolean)
    .join(' ')

  const handlePointerEnter = () => {
    if (item.disabled) {
      return
    }
    buttonRef.current?.focus()
    if (item.type === 'submenu') {
      onOpenSubmenu()
    }
  }

  return (
    <div onPointerEnter={handlePointerEnter}>
      <button
        ref={(node) => {
          buttonRef.current = node
          setItemRef(node)
        }}
        type="button"
        role={item.type === 'checkbox' ? 'menuitemcheckbox' : 'menuitem'}
        aria-checked={item.type === 'checkbox' ? item.checked : undefined}
        aria-haspopup={item.type === 'submenu' ? 'menu' : undefined}
        aria-expanded={item.type === 'submenu' ? submenuOpen : undefined}
        disabled={item.disabled}
        className={itemClassName}
        tabIndex={itemIndex === 0 ? 0 : -1}
        onFocus={onFocus}
        onClick={selectItem}
      >
        <span className={styles.itemIndicator} aria-hidden="true">
          {item.type === 'checkbox' && item.checked ? '✓' : null}
        </span>
        <span className={styles.itemLabel}>{item.label}</span>
        <span className={styles.itemMeta} aria-hidden={item.meta === undefined}>
          {item.type === 'submenu' ? '›' : item.meta}
        </span>
      </button>
      {item.type === 'submenu' && submenuOpen ? (
        <LeafSubmenu
          label={`${item.label} submenu`}
          items={item.items}
          parentRef={buttonRef}
          onRequestClose={onRequestClose}
          onCloseSubmenu={onCloseSubmenu}
          focusFirstOnOpen={focusFirstOnOpen}
        />
      ) : null}
    </div>
  )
}

type LeafSubmenuProps = {
  label: string
  items: MenuLeafItem[]
  parentRef: { current: HTMLButtonElement | null }
  onRequestClose: () => void
  onCloseSubmenu: () => void
  focusFirstOnOpen: boolean
}

const LeafSubmenu = ({
  label,
  items,
  parentRef,
  onRequestClose,
  onCloseSubmenu,
  focusFirstOnOpen,
}: LeafSubmenuProps) => {
  const [activeIndex, setActiveIndex] = useState(-1)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const didFocusOnOpenRef = useRef(false)
  const { refs, floatingStyles } = useFloating<HTMLButtonElement>({
    open: true,
    placement: 'right-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(MENU_OFFSET_PX),
      flip({ padding: MENU_VIEWPORT_PADDING_PX }),
      shift({ padding: MENU_VIEWPORT_PADDING_PX }),
      makeSizeMiddleware(),
    ],
  })

  useEffect(() => {
    refs.setReference(parentRef.current)
  }, [parentRef, refs])

  useEffect(() => {
    if (!focusFirstOnOpen) {
      didFocusOnOpenRef.current = false
    }
  }, [focusFirstOnOpen])

  const focusItem = (index: number) => {
    if (index < 0) {
      return
    }
    setActiveIndex(index)
    itemRefs.current[index]?.focus()
  }

  useLayoutEffect(() => {
    if (!focusFirstOnOpen) {
      return
    }
    focusItem(getFirstEnabledIndex(items))
  }, [focusFirstOnOpen, items])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onRequestClose()
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      event.stopPropagation()
      onCloseSubmenu()
      parentRef.current?.focus()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      focusItem(getNextEnabledIndex(items, activeIndex, direction))
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      event.stopPropagation()
      focusItem(getFirstEnabledIndex(items))
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      event.stopPropagation()
      focusItem(getLastEnabledIndex(items))
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      const focusedIndex = itemRefs.current.findIndex((node) => node === document.activeElement)
      activateLeafMenuItem(items[focusedIndex === -1 ? activeIndex : focusedIndex], onRequestClose)
    }
  }

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        className={styles.menu}
        style={floatingStyles}
        role="menu"
        aria-label={label}
        onKeyDown={handleKeyDown}
      >
        {items.map((item, index) =>
          item.type === 'separator' ? (
            <div key={item.id} className={styles.separator} role="separator" />
          ) : (
            <LeafMenuButton
              key={item.id}
              item={item}
              itemIndex={index}
              active={activeIndex === index}
              setItemRef={(node) => {
                itemRefs.current[index] = node
                if (
                  node &&
                  focusFirstOnOpen &&
                  !didFocusOnOpenRef.current &&
                  index === getFirstEnabledIndex(items)
                ) {
                  didFocusOnOpenRef.current = true
                  node.focus()
                }
              }}
              onFocus={() => setActiveIndex(index)}
              onRequestClose={onRequestClose}
            />
          ),
        )}
      </div>
    </FloatingPortal>
  )
}

type LeafMenuButtonProps = {
  item: MenuActionItem | MenuCheckboxItem
  itemIndex: number
  active: boolean
  setItemRef: (node: HTMLButtonElement | null) => void
  onFocus: () => void
  onRequestClose: () => void
}

const LeafMenuButton = ({
  item,
  itemIndex,
  active,
  setItemRef,
  onFocus,
  onRequestClose,
}: LeafMenuButtonProps) => {
  const selectItem = () => {
    activateLeafMenuItem(item, onRequestClose)
  }

  const itemClassName = [
    styles.menuItem,
    active ? styles.menuItemActive : '',
    'destructive' in item && item.destructive ? styles.menuItemDestructive : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={setItemRef}
      type="button"
      role={item.type === 'checkbox' ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={item.type === 'checkbox' ? item.checked : undefined}
      disabled={item.disabled}
      className={itemClassName}
      tabIndex={itemIndex === 0 ? 0 : -1}
      onFocus={onFocus}
      onPointerEnter={(event) => {
        if (!item.disabled) {
          event.currentTarget.focus()
        }
      }}
      onClick={selectItem}
    >
      <span className={styles.itemIndicator} aria-hidden="true">
        {item.type === 'checkbox' && item.checked ? '✓' : null}
      </span>
      <span className={styles.itemLabel}>{item.label}</span>
      <span className={styles.itemMeta} aria-hidden={item.meta === undefined}>
        {item.meta}
      </span>
    </button>
  )
}
