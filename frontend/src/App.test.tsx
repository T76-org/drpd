import { render, screen } from '@testing-library/react'
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
  it('renders the app scaling shell around the rack view', async () => {
    saveRackDocument({
      racks: [
        {
          id: 'bench-rack-a',
          name: 'Bench Rack A',
          totalUnits: 8,
          devices: [],
          rows: []
        }
      ]
    })
    const { container } = render(<App />)

    expect(screen.getByTestId('app-viewport')).toBeInTheDocument()
    expect(screen.getByTestId('app-scale-shell')).toHaveAttribute('data-app-scale', '1.000')
    expect(screen.getByTestId('app-scale-content')).toBeInTheDocument()
    expect(await screen.findByAltText('Dr.PD')).toBeInTheDocument()
    expect(container.querySelector('[data-testid="app-scale-content"] [data-testid="rack-rows"]')).not.toBeNull()
  })
})
