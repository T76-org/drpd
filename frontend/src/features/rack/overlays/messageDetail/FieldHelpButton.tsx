import { useState } from 'react'
import { Dialog, DialogButton } from '../../../../ui/overlays'
import styles from '../../instruments/DrpdMessageDetailInstrumentView.module.css'

export const FieldHelpButton = ({
  label,
  explanation,
}: {
  label: string
  explanation: string
}) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <span className={styles.fieldHelp}>
      <button
        type="button"
        className={styles.fieldHelpButton}
        aria-label={`Show description for ${label}`}
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen(true)
        }}
      >
        <span className={styles.fieldHelpButtonIcon} aria-hidden="true">
          ?
        </span>
      </button>
      <Dialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title={label}
        footer={<DialogButton onClick={() => setIsOpen(false)}>Close</DialogButton>}
      >
        {explanation}
      </Dialog>
    </span>
  )
}
