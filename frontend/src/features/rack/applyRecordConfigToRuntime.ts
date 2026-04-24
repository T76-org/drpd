import {
  CCBusRole,
  SinkState,
  normalizeDRPDDeviceConfig,
  type DRPDDriverRuntime,
  type TriggerMessageTypeFilter,
} from '../../lib/device'
import type { RackDeviceRecord } from '../../lib/rack/types'

interface DeviceRuntimeConfigTarget {
  drpdDriver?: DRPDDriverRuntime
}

const areTriggerMessageTypeFiltersEqual = (
  left: TriggerMessageTypeFilter[],
  right: TriggerMessageTypeFilter[],
): boolean =>
  left.length === right.length &&
  left.every((entry, index) =>
    entry.class === right[index]?.class &&
    entry.messageTypeNumber === right[index]?.messageTypeNumber,
  )

const sleep = async (ms: number): Promise<void> =>
  await new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })

const isSinkReplayReadyState = (status: unknown): boolean =>
  status === SinkState.PE_SNK_READY || status === SinkState.PE_SNK_EPR_KEEPALIVE

const waitForSinkReplayReady = async (
  driver: DRPDDriverRuntime,
  requestedIndex: number,
): Promise<boolean> => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const role =
      (await driver.ccBus.getRole().catch(() => driver.getState().role)) ??
      driver.getState().role
    if (role === CCBusRole.SINK) {
      const sinkInfo =
        (await driver.sink.getSinkInfo().catch(() => driver.getState().sinkInfo)) ??
        driver.getState().sinkInfo
      const pdoCount =
        (await driver.sink.getAvailablePdoCount().catch(() => null)) ??
        driver.getState().sinkPdoList?.length ??
        0
      if (pdoCount > requestedIndex && isSinkReplayReadyState(sinkInfo?.status)) {
        return true
      }
    }
    await driver.refreshState().catch(() => undefined)
    await sleep(150)
  }
  return false
}

export const applyRecordConfigToRuntime = async (
  record: RackDeviceRecord,
  runtime: DeviceRuntimeConfigTarget | null | undefined,
): Promise<void> => {
  if (!runtime?.drpdDriver) {
    return
  }
  const driver = runtime.drpdDriver
  const config = normalizeDRPDDeviceConfig(record.config)

  await driver.configureLogging(config.logging)

  if (config.role && driver.getState().role !== config.role) {
    await driver.ccBus.setRole(config.role)
    await driver.refreshState()
  }

  if (
    config.captureEnabled &&
    driver.getState().captureEnabled !== config.captureEnabled
  ) {
    await driver.setCaptureEnabled(config.captureEnabled)
  }

  const currentRole = driver.getState().role
  if (
    config.sinkRequest &&
    (config.role ?? currentRole) === CCBusRole.SINK
  ) {
    const sinkReady = await waitForSinkReplayReady(driver, config.sinkRequest.index)
    if (sinkReady) {
      const currentSinkInfo = driver.getState().sinkInfo
      if (
        currentSinkInfo?.negotiatedVoltageMv !== config.sinkRequest.voltageMv ||
        currentSinkInfo?.negotiatedCurrentMa !== config.sinkRequest.currentMa
      ) {
        await driver.sink.requestPdo(
          config.sinkRequest.index,
          config.sinkRequest.voltageMv,
          config.sinkRequest.currentMa,
        )
        await driver.refreshState()
      }
    }
  }

  if (config.trigger) {
    const currentTrigger = driver.getState().triggerInfo
    if (currentTrigger?.type !== config.trigger.type) {
      await driver.trigger.setEventType(config.trigger.type)
    }
    if (currentTrigger?.eventThreshold !== config.trigger.eventThreshold) {
      await driver.trigger.setEventThreshold(config.trigger.eventThreshold)
    }
    if (currentTrigger?.senderFilter !== config.trigger.senderFilter) {
      await driver.trigger.setSenderFilter(config.trigger.senderFilter)
    }
    if (currentTrigger?.autorepeat !== config.trigger.autorepeat) {
      await driver.trigger.setAutoRepeat(config.trigger.autorepeat)
    }
    if (currentTrigger?.syncMode !== config.trigger.syncMode) {
      await driver.trigger.setSyncMode(config.trigger.syncMode)
    }
    if (currentTrigger?.syncPulseWidthUs !== config.trigger.syncPulseWidthUs) {
      await driver.trigger.setSyncPulseWidthUs(config.trigger.syncPulseWidthUs)
    }
    if (
      !currentTrigger ||
      !areTriggerMessageTypeFiltersEqual(
        currentTrigger.messageTypeFilters,
        config.trigger.messageTypeFilters,
      )
    ) {
      await driver.trigger.setMessageTypeFilters(config.trigger.messageTypeFilters)
    }
    await driver.refreshState()
  }
}
