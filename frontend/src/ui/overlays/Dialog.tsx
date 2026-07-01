import {
  FloatingFocusManager,
  FloatingOverlay,
  FloatingPortal,
  useDismiss,
  useFloating,
  useInteractions,
} from '@floating-ui/react'
import {
  useId,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import styles from './Dialog.module.css'

const PRIMARY_ACTION_SELECTOR = '[data-dialog-primary-action="true"]'

/**
 * Return whether an Enter key event should preserve native element behavior.
 */
const shouldIgnoreDialogEnter = (event: KeyboardEvent<HTMLElement>): boolean => {
  if (
    event.defaultPrevented ||
    event.key !== 'Enter' ||
    event.shiftKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.nativeEvent.isComposing
  ) {
    return true
  }

  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return true
  }
  if (target.isContentEditable) {
    return true
  }

  const tagName = target.tagName.toLowerCase()
  return (
    tagName === 'button' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    tagName === 'a'
  )
}

/**
 * Activate the dialog's primary action when Enter is pressed from dialog content.
 */
const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
  if (shouldIgnoreDialogEnter(event)) {
    return
  }

  const primaryAction = event.currentTarget.querySelector<HTMLButtonElement>(
    PRIMARY_ACTION_SELECTOR,
  )
  if (
    !primaryAction ||
    primaryAction.disabled ||
    primaryAction.getAttribute('aria-disabled') === 'true'
  ) {
    return
  }

  event.preventDefault()
  primaryAction.click()
}

export type DialogProps = {
  ///< Controlled open state.
  open: boolean
  ///< Called when dialog requests open-state change.
  onOpenChange: (open: boolean) => void
  ///< Dialog accessible title.
  title: ReactNode
  ///< Optional dialog description.
  description?: ReactNode
  ///< Dialog body.
  children: ReactNode
  ///< Footer buttons/actions.
  footer?: ReactNode
  ///< When false, Escape/backdrop do not close. Use for unsafe destructive flows.
  dismissible?: boolean
  ///< Accessible label override when title is not plain text.
  ariaLabel?: string
  ///< Optional style override for dialog shell.
  dialogStyle?: CSSProperties
}

/**
 * Reusable centered modal dialog with focus management and dimmed backdrop.
 */
export const Dialog = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  dismissible = true,
  ariaLabel,
  dialogStyle,
}: DialogProps) => {
  const titleId = useId()
  const descriptionId = useId()
  const { refs, context } = useFloating({
    open,
    onOpenChange,
  })
  const dismiss = useDismiss(context, {
    escapeKey: dismissible,
    outsidePress: dismissible,
  })
  const { getFloatingProps } = useInteractions([dismiss])

  if (!open) {
    return null
  }

  return (
    <FloatingPortal>
      <FloatingOverlay className={styles.overlay} lockScroll>
        <FloatingFocusManager context={context} modal returnFocus>
          <div
            {...getFloatingProps({
              ref: refs.setFloating,
              className: styles.dialog,
              style: { zIndex: 10000, ...dialogStyle },
              role: 'dialog',
              'aria-modal': true,
              'aria-label': ariaLabel,
              'aria-labelledby': ariaLabel ? undefined : titleId,
              'aria-describedby': description ? descriptionId : undefined,
              onKeyDown: handleDialogKeyDown,
            })}
          >
            <DialogHeader
              title={title}
              description={description}
              titleId={titleId}
              descriptionId={descriptionId}
            />
            <DialogBody>{children}</DialogBody>
            {footer ? <DialogFooter>{footer}</DialogFooter> : null}
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  )
}

export type DialogHeaderProps = {
  title: ReactNode
  description?: ReactNode
  titleId?: string
  descriptionId?: string
}

/**
 * Dialog heading block.
 */
export const DialogHeader = ({
  title,
  description,
  titleId,
  descriptionId,
}: DialogHeaderProps) => (
  <header className={styles.header}>
    <h2 id={titleId} className={styles.title}>
      {title}
    </h2>
    {description ? (
      <p id={descriptionId} className={styles.description}>
        {description}
      </p>
    ) : null}
  </header>
)

/**
 * Dialog body wrapper.
 */
export const DialogBody = ({ className, ...props }: ComponentPropsWithoutRef<'div'>) => (
  <div className={[styles.body, className].filter(Boolean).join(' ')} {...props} />
)

/**
 * Compact form wrapper for dialog fields.
 */
export const DialogForm = ({ className, ...props }: ComponentPropsWithoutRef<'div'>) => (
  <div className={[styles.form, className].filter(Boolean).join(' ')} {...props} />
)

export type DialogFormRowProps = ComponentPropsWithoutRef<'div'> & {
  label: ReactNode
  htmlFor?: string
  helpText?: ReactNode
  errorText?: ReactNode
}

/**
 * Two-column dialog form row matching popover field layout.
 */
export const DialogFormRow = ({
  label,
  htmlFor,
  helpText,
  errorText,
  children,
  className,
  ...props
}: DialogFormRowProps) => (
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
 * Bottom-aligned dialog action row.
 */
export const DialogFooter = ({ className, ...props }: ComponentPropsWithoutRef<'div'>) => (
  <footer className={[styles.footer, className].filter(Boolean).join(' ')} {...props} />
)

export type DialogButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: 'default' | 'primary' | 'danger'
}

/**
 * Compact dialog button matching popover actions.
 */
export const DialogButton = ({
  variant = 'default',
  className,
  ...props
}: DialogButtonProps) => (
  <button
    type="button"
    data-dialog-primary-action={variant === 'primary' ? 'true' : undefined}
    className={[
      styles.button,
      variant === 'primary' ? styles.primaryButton : '',
      variant === 'danger' ? styles.dangerButton : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    {...props}
  />
)

/**
 * Standard compact input style for dialog examples and adopters.
 */
export const DialogInput = ({ className, ...props }: ComponentPropsWithoutRef<'input'>) => (
  <input className={[styles.input, className].filter(Boolean).join(' ')} {...props} />
)
