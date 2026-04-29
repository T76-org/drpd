import type { CSSProperties } from 'react'
import { Dialog, DialogButton } from '../../../../ui/overlays'
import type { FirmwareRelease } from '../../../../lib/firmware'
import styles from '../../RackView.module.css'

type FirmwareUploadPhase =
  | 'prompt'
  | 'downloading'
  | 'rebooting'
  | 'waiting'
  | 'uploading'
  | 'success'
  | 'failure'

export interface FirmwareUpdateDialogState {
  currentVersion: string
  targetRelease: FirmwareRelease
  phase: FirmwareUploadPhase
  suppressVersion: boolean
  progress: number
  statusMessage: string
  errorMessage?: string
}

export const FirmwareUpdateDialog = ({
  prompt,
  busy,
  onOpenChange,
  onSuppressVersionChange,
  onDecline,
  onAccept,
  onRetry,
  onDone,
}: {
  prompt: FirmwareUpdateDialogState | null
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSuppressVersionChange: (value: boolean) => void
  onDecline: () => void
  onAccept: () => void
  onRetry: () => void
  onDone: () => void
}) => (
  <Dialog
    open={prompt != null}
    onOpenChange={(open) => {
      if (!open && busy) {
        return
      }
      onOpenChange(open)
    }}
    title="Firmware update available"
    dismissible={!busy}
    footer={
      prompt?.phase === 'prompt' ? (
        <>
          <DialogButton onClick={onDecline}>Not Now</DialogButton>
          <DialogButton variant="primary" onClick={onAccept}>Upload Firmware</DialogButton>
        </>
      ) : prompt?.phase === 'failure' ? (
        <>
          <DialogButton onClick={onDone}>Close</DialogButton>
          <DialogButton variant="primary" onClick={onRetry}>Retry</DialogButton>
        </>
      ) : prompt?.phase === 'success' ? (
        <DialogButton variant="primary" onClick={onDone}>Done</DialogButton>
      ) : null
    }
  >
    {prompt ? (
      <>
        <p className={styles.firmwareUpdateText}>{prompt.statusMessage}</p>
        <dl className={styles.firmwareVersionList}>
          <div>
            <dt>Installed</dt>
            <dd>{prompt.currentVersion}</dd>
          </div>
          <div>
            <dt>Available</dt>
            <dd>{prompt.targetRelease.versionText}</dd>
          </div>
        </dl>
        {prompt.phase === 'prompt' ? (
          <label className={styles.firmwareSuppressOption}>
            <input
              type="checkbox"
              checked={prompt.suppressVersion}
              onChange={(event) => onSuppressVersionChange(event.target.checked)}
            />
            <span>Do not ask again for this version</span>
          </label>
        ) : null}
        {prompt.phase !== 'prompt' ? (
          <div className={styles.firmwareUploadStatus}>
            <div className={styles.firmwareUploadWarning}>
              Do not disconnect the device. Do not refresh the page.
            </div>
            <div className={styles.firmwareProgressShell} aria-label="Firmware upload progress">
              <div
                className={styles.firmwareProgressBar}
                style={{ '--firmware-progress': `${Math.round(prompt.progress * 100)}%` } as CSSProperties}
              />
            </div>
            {prompt.errorMessage ? (
              <div className={styles.firmwareUploadError}>
                Error: {prompt.errorMessage}
              </div>
            ) : null}
          </div>
        ) : null}
      </>
    ) : null}
  </Dialog>
)
