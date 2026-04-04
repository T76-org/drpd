import { describe, expect, it, vi } from 'vitest'
import { DebugLogRegistry } from './debugLogger'

describe('DebugLogRegistry', () => {
  it('disables debug output by default', () => {
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const debugLogs = new DebugLogRegistry()

    debugLogs.getLogger('drpd.device').debug('hidden')

    expect(consoleDebug).not.toHaveBeenCalled()
  })

  it('enables an exact scope', () => {
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const debugLogs = new DebugLogRegistry()

    debugLogs.setScopeEnabled('drpd.device', true)
    debugLogs.getLogger('drpd.device').debug('visible')

    expect(consoleDebug).toHaveBeenCalledWith('[drpd.device] visible')
  })

  it('inherits enabled state from the nearest parent scope', () => {
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const debugLogs = new DebugLogRegistry()

    debugLogs.setScopeEnabled('drpd', true)
    debugLogs.getLogger('drpd.transport.usbtmc').debug('via parent')

    expect(consoleDebug).toHaveBeenCalledWith('[drpd.transport.usbtmc] via parent')
  })

  it('lets a child scope override a parent scope', () => {
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const debugLogs = new DebugLogRegistry()

    debugLogs.setScopeEnabled('drpd', true)
    debugLogs.setScopeEnabled('drpd.transport.usbtmc', false)
    debugLogs.getLogger('drpd.transport.usbtmc').debug('hidden child')

    expect(consoleDebug).not.toHaveBeenCalled()
  })

  it('updates existing logger instances when scope rules change', () => {
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const debugLogs = new DebugLogRegistry()
    const logger = debugLogs.getLogger('drpd.device')

    logger.debug('before')
    debugLogs.setScopeEnabled('drpd.device', true)
    logger.debug('after')

    expect(consoleDebug).toHaveBeenCalledTimes(1)
    expect(consoleDebug).toHaveBeenCalledWith('[drpd.device] after')
  })
})
