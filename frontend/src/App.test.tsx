import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { saveRackDocument } from './lib/rack/loadRack'
import App from './App'

/**
 * Create a minimal in-memory localStorage mock.
 */
const createStorage = (): Storage => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length
    }
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('App', () => {
  it('renders the app viewport around the rack view without a scale shell', async () => {
    saveRackDocument({
      pairedDevices: [],
      racks: [
        {
          id: 'bench-rack-a',
          name: 'Bench Rack A',
          totalUnits: 8,
          rows: []
        }
      ]
    })
    const { container } = render(<App />)

    expect(screen.getByTestId('app-viewport')).toBeInTheDocument()
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
    expect(await screen.findByAltText('Dr.PD')).toBeInTheDocument()
    expect(container.querySelector('[data-testid="app-content"] [data-testid="rack-rows"]')).not.toBeNull()
  })

  it('shows three initial notice pages with previous and next navigation', async () => {
    const user = userEvent.setup()
    render(<App />)

    const dialog = await screen.findByRole('dialog', { name: /Before you begin… 1 of 3/ })
    const safetyLink = within(dialog).getByRole('link', { name: 'safety guidelines' })
    expect(safetyLink).toHaveAttribute(
      'href',
      'https://t76.org/drpd/docs/important-warnings',
    )
    expect(safetyLink).toHaveAttribute(
      'target',
      '_blank',
    )
    expect(within(dialog).getByText(/USB-PD devices can deliver high levels of power/i).closest('blockquote')).not.toBeNull()
    expect(within(dialog).getByTestId('initial-notice-content')).toHaveClass('initialNoticeContent')
    expect(within(dialog).getByLabelText('Do not show this again')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Previous' })).toBeDisabled()

    await user.click(within(dialog).getByRole('button', { name: 'Next' }))
    expect(within(dialog).getByText(/do not track our users/i)).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'target',
      '_blank',
    )
    expect(within(dialog).getByText('2 of 3')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Previous' })).toBeEnabled()

    await user.click(within(dialog).getByRole('button', { name: 'Next' }))
    expect(within(dialog).getByText('3 of 3')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'user guide' })).toHaveAttribute(
      'href',
      'https://t76.org/drpd/docs/',
    )
    expect(within(dialog).getByRole('link', { name: 'user guide' })).toHaveAttribute(
      'target',
      '_blank',
    )
    expect(within(dialog).getByRole('link', { name: 'Python library' })).toHaveAttribute(
      'target',
      '_blank',
    )
    expect(within(dialog).getByRole('button', { name: 'OK' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Previous' }))
    expect(within(dialog).getByText(/do not track our users/i)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })

  it('persists initial notice suppression when requested', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)
    const dialog = await screen.findByRole('dialog', { name: /Before you begin… 1 of 3/ })

    await user.click(within(dialog).getByLabelText('Do not show this again'))
    await user.click(within(dialog).getByRole('button', { name: 'Next' }))
    await user.click(within(dialog).getByRole('button', { name: 'Next' }))
    await user.click(within(dialog).getByRole('button', { name: 'OK' }))

    expect(screen.queryByRole('dialog', { name: /Before you begin…/ })).not.toBeInTheDocument()
    expect(window.localStorage.getItem('drpd:initial-notice-suppressed')).toBe('true')

    unmount()
    render(<App />)
    expect(screen.queryByRole('dialog', { name: /Before you begin…/ })).not.toBeInTheDocument()
  })

  it('shows the initial notice again when suppression is not requested', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)
    const dialog = await screen.findByRole('dialog', { name: /Before you begin… 1 of 3/ })

    await user.click(within(dialog).getByRole('button', { name: 'Next' }))
    await user.click(within(dialog).getByRole('button', { name: 'Next' }))
    await user.click(within(dialog).getByRole('button', { name: 'OK' }))
    expect(window.localStorage.getItem('drpd:initial-notice-suppressed')).toBeNull()

    unmount()
    render(<App />)
    expect(await screen.findByRole('dialog', { name: /Before you begin… 1 of 3/ })).toBeInTheDocument()
  })

  it('offers pairing after the initial notice when there are no paired devices', async () => {
    const user = userEvent.setup()
    saveRackDocument({
      pairedDevices: [],
      racks: [{ id: 'bench-rack-a', name: 'Bench Rack A', totalUnits: 8, rows: [] }],
    })
    render(<App />)

    const notice = await screen.findByRole('dialog', { name: /Before you begin… 1 of 3/ })
    expect(screen.queryByRole('dialog', { name: 'Pair a device' })).not.toBeInTheDocument()

    await user.click(within(notice).getByRole('button', { name: 'Next' }))
    await user.click(within(notice).getByRole('button', { name: 'Next' }))
    await user.click(within(notice).getByRole('button', { name: 'OK' }))

    const pairingDialog = await screen.findByRole('dialog', { name: 'Pair a device' })
    expect(within(pairingDialog).getByText(/There are no paired devices/i)).toBeInTheDocument()
  })

  it('launches the USB picker when startup pairing is accepted', async () => {
    const user = userEvent.setup()
    const requestDevice = vi.fn(async () => {
      throw new DOMException('User cancelled', 'NotFoundError')
    })
    window.localStorage.setItem('drpd:initial-notice-suppressed', 'true')
    Object.defineProperty(navigator, 'usb', {
      configurable: true,
      value: { getDevices: vi.fn(async () => []), requestDevice },
    })
    saveRackDocument({
      pairedDevices: [],
      racks: [{ id: 'bench-rack-a', name: 'Bench Rack A', totalUnits: 8, rows: [] }],
    })
    render(<App />)

    const pairingDialog = await screen.findByRole('dialog', { name: 'Pair a device' })
    await user.click(within(pairingDialog).getByRole('button', { name: 'Yes' }))

    expect(requestDevice).toHaveBeenCalledOnce()
  })
})
