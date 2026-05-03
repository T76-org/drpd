import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BeforeInstallPromptEvent, PWAInstallOutcome } from './usePWAInstallPrompt'
import { usePWAInstallPrompt } from './usePWAInstallPrompt'

const TestInstallPrompt = () => {
  const { canInstall, isInstalled, promptInstall } = usePWAInstallPrompt()

  return (
    <div>
      <div data-testid="can-install">{String(canInstall)}</div>
      <div data-testid="is-installed">{String(isInstalled)}</div>
      <button
        type="button"
        disabled={!canInstall}
        onClick={() => {
          void promptInstall()
        }}
      >
        Install
      </button>
    </div>
  )
}

const mockDisplayMode = (standalone: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(display-mode: standalone)' ? standalone : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    })),
  )
}

const dispatchBeforeInstallPrompt = (
  outcome: PWAInstallOutcome = 'accepted',
): BeforeInstallPromptEvent & { preventDefault: ReturnType<typeof vi.fn> } => {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent & {
    preventDefault: ReturnType<typeof vi.fn>
  }
  Object.defineProperties(event, {
    platforms: { value: ['web'] },
    prompt: { value: vi.fn(async () => undefined) },
    userChoice: { value: Promise.resolve({ outcome, platform: 'web' }) },
  })
  event.preventDefault = vi.fn()

  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

beforeEach(() => {
  mockDisplayMode(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usePWAInstallPrompt', () => {
  it('captures beforeinstallprompt and prompts from a user action', async () => {
    render(<TestInstallPrompt />)

    const event = dispatchBeforeInstallPrompt()

    await waitFor(() => {
      expect(screen.getByTestId('can-install')).toHaveTextContent('true')
    })
    expect(event.preventDefault).toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Install' }))

    expect(event.prompt).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.getByTestId('can-install')).toHaveTextContent('false')
    })
  })

  it('clears install availability when the app is installed elsewhere', async () => {
    render(<TestInstallPrompt />)

    dispatchBeforeInstallPrompt()
    await waitFor(() => {
      expect(screen.getByTestId('can-install')).toHaveTextContent('true')
    })

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('can-install')).toHaveTextContent('false')
      expect(screen.getByTestId('is-installed')).toHaveTextContent('true')
    })
  })

  it('reports installed when launched in standalone display mode', () => {
    mockDisplayMode(true)

    render(<TestInstallPrompt />)

    expect(screen.getByTestId('can-install')).toHaveTextContent('false')
    expect(screen.getByTestId('is-installed')).toHaveTextContent('true')
  })
})
