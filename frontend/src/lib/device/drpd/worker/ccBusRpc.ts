/** Whitelisted CC bus RPC shared by the worker and host-side routing tests. */
import type { DRPDCCBus } from '../ccBus'
import type { CCBusRole } from '../types'
/** Dispatch supported CC methods without exposing arbitrary worker methods. */
export const dispatchCCBusRpc = async (
  ccBus: Pick<DRPDCCBus, 'getRole' | 'setRole' | 'getCableTestResult'>,
  method: string,
  args: unknown[],
): Promise<{ handled: true; value: unknown } | { handled: false }> => {
  if (method === 'getRole') return { handled: true, value: await ccBus.getRole() }
  if (method === 'getCableTestResult') return { handled: true, value: await ccBus.getCableTestResult() }
  if (method === 'setRole') {
    await ccBus.setRole(args[0] as CCBusRole)
    return { handled: true, value: null }
  }
  return { handled: false }
}
