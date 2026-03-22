/**
 * @file debugLogger.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Centralized hierarchical debug logging helpers.
 */

/**
 * Persisted configuration for one named debug scope.
 */
export interface DebugLogScopeRule {
  scope: string
  enabled: boolean
}

type DebugLogScopeListener = (scope: string, enabled: boolean | undefined) => void

/**
 * Central registry for named hierarchical debug log scopes.
 */
export class DebugLogRegistry {
  private readonly rules = new Map<string, boolean>()
  private readonly loggers = new Map<string, DebugLogger>()
  private readonly listeners = new Set<DebugLogScopeListener>()

  /**
   * Return a logger bound to the provided scope.
   *
   * @param scope - Hierarchical scope name.
   * @returns Cached scoped logger.
   */
  getLogger(scope: string): DebugLogger {
    const normalizedScope = this.normalizeScope(scope)
    let logger = this.loggers.get(normalizedScope)
    if (!logger) {
      logger = new DebugLogger(this, normalizedScope)
      this.loggers.set(normalizedScope, logger)
    }
    return logger
  }

  /**
   * Configure an explicit enable/disable rule for one scope.
   *
   * @param scope - Hierarchical scope name.
   * @param enabled - True to enable debug output for this scope.
   */
  setScopeEnabled(scope: string, enabled: boolean): void {
    const normalizedScope = this.normalizeScope(scope)
    this.rules.set(normalizedScope, enabled)
    this.emitChange(normalizedScope, enabled)
  }

  /**
   * Remove an explicit rule so the scope inherits from its nearest parent.
   *
   * @param scope - Hierarchical scope name.
   */
  clearScope(scope: string): void {
    const normalizedScope = this.normalizeScope(scope)
    if (!this.rules.delete(normalizedScope)) {
      return
    }
    this.emitChange(normalizedScope, undefined)
  }

  /**
   * Return the explicit rule for one scope, if present.
   *
   * @param scope - Hierarchical scope name.
   * @returns Explicit setting or undefined when inherited.
   */
  getScopeEnabled(scope: string): boolean | undefined {
    return this.rules.get(this.normalizeScope(scope))
  }

  /**
   * Resolve whether a scope is enabled after applying hierarchical inheritance.
   *
   * @param scope - Hierarchical scope name.
   * @returns True when debug output should be emitted.
   */
  isEnabled(scope: string): boolean {
    let currentScope: string | undefined = this.normalizeScope(scope)
    while (currentScope) {
      const rule = this.rules.get(currentScope)
      if (rule != null) {
        return rule
      }
      const separatorIndex = currentScope.lastIndexOf('.')
      currentScope = separatorIndex >= 0 ? currentScope.slice(0, separatorIndex) : undefined
    }
    return false
  }

  /**
   * Return a stable snapshot of explicit scope rules.
   *
   * @returns Sorted explicit scope settings.
   */
  getScopeRules(): DebugLogScopeRule[] {
    return Array.from(this.rules.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([scope, enabled]) => ({ scope, enabled }))
  }

  /**
   * Subscribe to explicit scope rule changes.
   *
   * @param listener - Change callback.
   * @returns Unsubscribe callback.
   */
  subscribe(listener: DebugLogScopeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Normalize a scope string into the internal canonical form.
   *
   * @param scope - Scope to normalize.
   * @returns Trimmed scope.
   * @throws Error when the scope is empty.
   */
  private normalizeScope(scope: string): string {
    const normalized = scope.trim()
    if (!normalized) {
      throw new Error('Debug log scope must not be empty')
    }
    return normalized
  }

  /**
   * Notify listeners about an explicit rule change.
   *
   * @param scope - Changed scope.
   * @param enabled - New explicit value, or undefined when cleared.
   */
  private emitChange(scope: string, enabled: boolean | undefined): void {
    for (const listener of this.listeners) {
      listener(scope, enabled)
    }
  }
}

/**
 * Lightweight scoped logger backed by a shared registry.
 */
export class DebugLogger {
  private readonly registry: DebugLogRegistry
  private readonly scope: string

  /**
   * Create a logger bound to one scope.
   *
   * @param registry - Backing registry.
   * @param scope - Hierarchical scope name.
   */
  constructor(registry: DebugLogRegistry, scope: string) {
    this.registry = registry
    this.scope = scope
  }

  /**
   * Emit one debug log line when this scope resolves to enabled.
   *
   * @param message - Log message body.
   */
  debug(message: string): void {
    if (!this.registry.isEnabled(this.scope)) {
      return
    }
    console.debug(`[${this.scope}] ${message}`)
  }
}
