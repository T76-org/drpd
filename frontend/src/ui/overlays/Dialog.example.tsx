import { useState } from 'react'
import {
  Dialog,
  DialogButton,
  DialogForm,
  DialogFormRow,
  DialogInput,
} from './Dialog'

/**
 * Isolated minimal dialog example for local development and tests.
 */
export const DialogExample = () => {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('Rack')

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Rack settings"
        description="Adjust shared rack metadata."
        footer={
          <>
            <DialogButton onClick={() => setOpen(false)}>Cancel</DialogButton>
            <DialogButton variant="primary" onClick={() => setOpen(false)}>
              Save
            </DialogButton>
          </>
        }
      >
        <DialogForm>
          <DialogFormRow label="Name" htmlFor="dialog-example-name" helpText="Visible rack name.">
            <DialogInput
              id="dialog-example-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </DialogFormRow>
        </DialogForm>
      </Dialog>
    </>
  )
}
