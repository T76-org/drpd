import { useState } from 'react'
import {
  Popover,
  PopoverButton,
  PopoverButtonRow,
  PopoverForm,
  PopoverFormRow,
  PopoverInput,
  PopoverSection,
} from './Popover'

/**
 * Isolated minimal popover example for local development and tests.
 */
export const PopoverExample = () => {
  const [name, setName] = useState('DRPD')
  const [open, setOpen] = useState(false)

  return (
    <Popover
      label="Instrument settings"
      open={open}
      onOpenChange={setOpen}
      trigger={(props) => (
        <button type="button" {...props}>
          Configure
        </button>
      )}
    >
      <PopoverSection title="Instrument">
        <PopoverForm>
          <PopoverFormRow
            label="Name"
            htmlFor="popover-example-name"
            helpText="Shown in compact rack headers."
          >
            <PopoverInput
              id="popover-example-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </PopoverFormRow>
        </PopoverForm>
        <PopoverButtonRow>
          <PopoverButton onClick={() => setOpen(false)}>Cancel</PopoverButton>
          <PopoverButton variant="primary" onClick={() => setOpen(false)}>
            Apply
          </PopoverButton>
        </PopoverButtonRow>
      </PopoverSection>
    </Popover>
  )
}
