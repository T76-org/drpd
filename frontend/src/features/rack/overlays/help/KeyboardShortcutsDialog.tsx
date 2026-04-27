import { Dialog, DialogButton } from '../../../../ui/overlays'
import { RACK_SHORTCUTS } from '../../shortcuts'
import styles from '../../RackView.module.css'

export const KeyboardShortcutsDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) => (
  <Dialog
    open={open}
    onOpenChange={onOpenChange}
    title="Keyboard shortcuts"
    description="Global rack shortcuts target the connected DRPD device."
    footer={<DialogButton onClick={() => onOpenChange(false)}>Close</DialogButton>}
  >
    <div className={styles.shortcutGrid}>
      {RACK_SHORTCUTS.map((shortcut) => (
        <article key={shortcut.id} className={styles.shortcutCard}>
          <kbd className={styles.shortcutKey}>{shortcut.key}</kbd>
          <div className={styles.shortcutCardBody}>
            <h3 className={styles.shortcutCardTitle}>{shortcut.label}</h3>
            <p className={styles.shortcutCardText}>{shortcut.description}</p>
          </div>
        </article>
      ))}
    </div>
  </Dialog>
)
