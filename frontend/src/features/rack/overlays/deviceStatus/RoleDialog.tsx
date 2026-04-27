import { CCBusRole } from '../../../../lib/device'
import { Dialog, DialogButton } from '../../../../ui/overlays'

export const RoleDialog = ({
  open,
  onOpenChange,
  role,
  isUpdating,
  formatRoleLabel,
  onSelectRole,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: CCBusRole | null
  isUpdating: boolean
  formatRoleLabel: (role: CCBusRole | null) => string
  onSelectRole: (role: CCBusRole) => void
}) => (
  <Dialog
    open={open}
    onOpenChange={onOpenChange}
    title="Set role"
    dismissible={!isUpdating}
    footer={
      <DialogButton onClick={() => onOpenChange(false)} disabled={isUpdating}>
        Cancel
      </DialogButton>
    }
  >
    <div role="menu" style={{ zIndex: 10000 }}>
      {Object.values(CCBusRole).map((nextRole) => {
        const isSelected = nextRole === role
        return (
          <DialogButton
            key={nextRole}
            variant={isSelected ? 'primary' : 'default'}
            role="menuitemradio"
            aria-checked={isSelected}
            onClick={() => {
              onOpenChange(false)
              onSelectRole(nextRole)
            }}
            disabled={isUpdating}
          >
            {formatRoleLabel(nextRole)}
          </DialogButton>
        )
      })}
    </div>
  </Dialog>
)
