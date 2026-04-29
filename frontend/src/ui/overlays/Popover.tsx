import {
  autoUpdate,
  flip,
  FloatingFocusManager,
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
  useState,
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from 'react'
import styles from './Popover.module.css'

export type PopoverTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref: (node: HTMLButtonElement | null) => void
}

export type PopoverProps = {
  ///< Accessible name for the popover dialog.
  label: string
  ///< Render a trigger button. Spread provided props onto the button.
  trigger: (props: PopoverTriggerProps) => ReactElement
  ///< Popover body.
  children: ReactNode
  ///< Preferred horizontal alignment below trigger.
  align?: 'start' | 'end'
  ///< Controlled open state.
  open?: boolean
  ///< Initial open state for uncontrolled use.
  defaultOpen?: boolean
  ///< Called whenever open state changes.
  onOpenChange?: (open: boolean) => void
}

const POPOVER_OFFSET_PX = 4
const POPOVER_VIEWPORT_PADDING_PX = 8
const MIN_POPOVER_HEIGHT_PX = 120

/**
 * Reusable floating popover for compact forms and controls.
 */
export const Popover = ({
  label,
  trigger,
  children,
  align = 'start',
  open,
  defaultOpen = false,
  onOpenChange,
}: PopoverProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isOpen = open ?? uncontrolledOpen

  const setOpen = (nextOpen: boolean) => {
    setUncontrolledOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  const placement: Placement = align === 'end' ? 'bottom-end' : 'bottom-start'
  const { refs, floatingStyles, context } = useFloating<HTMLButtonElement>({
    open: isOpen,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(POPOVER_OFFSET_PX),
      flip({ padding: POPOVER_VIEWPORT_PADDING_PX }),
      shift({ padding: POPOVER_VIEWPORT_PADDING_PX }),
      size({
        padding: POPOVER_VIEWPORT_PADDING_PX,
        apply({ availableHeight, availableWidth, elements }) {
          Object.assign(elements.floating.style, {
            maxHeight: `${Math.max(MIN_POPOVER_HEIGHT_PX, availableHeight)}px`,
            maxWidth: `${Math.max(220, availableWidth)}px`,
          })
        },
      }),
    ],
  })

  const click = useClick(context)
  const dismiss = useDismiss(context, {
    escapeKey: true,
    outsidePress: false,
  })
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss])

  const triggerProps = getReferenceProps({
    ref: refs.setReference,
    'aria-haspopup': 'dialog',
    'aria-expanded': isOpen,
  }) as unknown as PopoverTriggerProps

  return (
    <>
      {trigger(triggerProps)}
      {isOpen ? (
        <FloatingPortal>
          <FloatingFocusManager
            context={context}
            modal={false}
            returnFocus
            closeOnFocusOut={false}
          >
            <div
              {...getFloatingProps({
                ref: refs.setFloating,
                className: styles.popover,
                style: floatingStyles,
                role: 'dialog',
                'aria-label': label,
              })}
            >
              {children}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </>
  )
}

export type PopoverSectionProps = ComponentPropsWithoutRef<'section'> & {
  title?: ReactNode
}

/**
 * Compact popover section with optional title.
 */
export const PopoverSection = ({ title, children, className, ...props }: PopoverSectionProps) => (
  <section className={[styles.section, className].filter(Boolean).join(' ')} {...props}>
    {title ? <h2 className={styles.title}>{title}</h2> : null}
    {children}
  </section>
)

/**
 * Compact form wrapper for popover fields.
 */
export const PopoverForm = ({ className, ...props }: ComponentPropsWithoutRef<'div'>) => (
  <div className={[styles.form, className].filter(Boolean).join(' ')} {...props} />
)

export type PopoverFormRowProps = ComponentPropsWithoutRef<'div'> & {
  label: ReactNode
  htmlFor?: string
  helpText?: ReactNode
  errorText?: ReactNode
}

/**
 * Two-column label/control row with optional help and error text.
 */
export const PopoverFormRow = ({
  label,
  htmlFor,
  helpText,
  errorText,
  children,
  className,
  ...props
}: PopoverFormRowProps) => (
  <div className={[styles.formRow, className].filter(Boolean).join(' ')} {...props}>
    <label className={styles.label} htmlFor={htmlFor}>
      {label}
    </label>
    <div className={styles.fieldStack}>
      <div className={styles.controlSlot}>{children}</div>
      {helpText ? <p className={styles.helpText}>{helpText}</p> : null}
      {errorText ? <p className={styles.errorText}>{errorText}</p> : null}
    </div>
  </div>
)

/**
 * Bottom-aligned optional action row.
 */
export const PopoverButtonRow = ({ className, ...props }: ComponentPropsWithoutRef<'div'>) => (
  <div className={[styles.buttonRow, className].filter(Boolean).join(' ')} {...props} />
)

export type PopoverButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: 'default' | 'primary'
}

/**
 * Compact popover button matching rack controls.
 */
export const PopoverButton = ({
  variant = 'default',
  className,
  ...props
}: PopoverButtonProps) => (
  <button
    type="button"
    className={[
      styles.button,
      variant === 'primary' ? styles.primaryButton : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    {...props}
  />
)

/**
 * Standard popover text paragraph.
 */
export const PopoverText = ({ className, ...props }: ComponentPropsWithoutRef<'p'>) => (
  <p className={[styles.text, className].filter(Boolean).join(' ')} {...props} />
)

/**
 * Standard compact input style for popover examples and adopters.
 */
export const PopoverInput = ({ className, ...props }: ComponentPropsWithoutRef<'input'>) => (
  <input className={[styles.input, className].filter(Boolean).join(' ')} {...props} />
)
