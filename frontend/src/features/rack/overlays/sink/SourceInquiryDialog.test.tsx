import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SinkInquiryOutcome, SinkInquiryType, type SinkInquiryRequest } from '../../../../lib/device'
import { ACTIVE_SOURCE_INQUIRIES } from '../../inquiries/catalog'
import { formatSinkInquiryOutcome } from '../../inquiries/presentation'
import { SourceInquiryDialog } from './SourceInquiryDialog'

describe('SourceInquiryDialog', () => {
  const revision = ACTIVE_SOURCE_INQUIRIES.find(({ type }) => type === SinkInquiryType.GET_REVISION)!
  it('labels malformed and oversized protocol responses distinctly', () => {
    expect(formatSinkInquiryOutcome(SinkInquiryOutcome.MALFORMED_RESPONSE)).toBe('Malformed response')
    expect(formatSinkInquiryOutcome(SinkInquiryOutcome.RESPONSE_TOO_LARGE)).toBe('Response too large')
  })
  it('runs inquiry and shows consolidated raw result without decoding packet', async () => {
    const getInquiryStatus = vi.fn()
      .mockResolvedValueOnce({
        outcome: SinkInquiryOutcome.NONE,
        requestId: 1,
        type: SinkInquiryType.GET_REVISION,
        responseClass: 0,
        responseType: 0,
        responseLength: 0,
      })
      .mockResolvedValueOnce({
        outcome: SinkInquiryOutcome.RESPONSE,
        requestId: 2,
        type: SinkInquiryType.GET_REVISION,
        responseClass: 1,
        responseType: 12,
        responseLength: 2,
      })
    const client = {
      sendInquiry: vi.fn(async () => undefined),
      getInquiryStatus,
      getInquiryResponse: vi.fn(async () => new Uint8Array([0x12, 0xab])),
    }
    render(
      <SourceInquiryDialog
        open
        onOpenChange={vi.fn()}
        definition={revision}
        client={client}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Get revision' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Response received'))
    expect(screen.getByText('12 ab')).toBeInTheDocument()
    expect(screen.getByText('Full packet decoding remains available in Message Log.')).toBeInTheDocument()
  })

  it('shows Not Supported as protocol result', async () => {
    const getInquiryStatus = vi.fn()
      .mockResolvedValueOnce({
        outcome: SinkInquiryOutcome.NONE,
        requestId: 1,
        type: SinkInquiryType.GET_REVISION,
        responseClass: 0,
        responseType: 0,
        responseLength: 0,
      })
      .mockResolvedValueOnce({
        outcome: SinkInquiryOutcome.NOT_SUPPORTED,
        requestId: 2,
        type: SinkInquiryType.GET_REVISION,
        responseClass: 0,
        responseType: 0,
        responseLength: 0,
      })
    render(
      <SourceInquiryDialog
        open
        onOpenChange={vi.fn()}
        definition={revision}
        client={{
          sendInquiry: vi.fn(async () => undefined),
          getInquiryStatus,
          getInquiryResponse: vi.fn(async () => new Uint8Array()),
        }}
      />,
    )
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Not Supported'))
    expect(screen.queryByText(/Communication error/)).not.toBeInTheDocument()
  })

  it('requires fresh Status confirmation after another inquiry and after reopen', async () => {
    const statusDefinition = ACTIVE_SOURCE_INQUIRIES.find(({ type }) => type === SinkInquiryType.GET_STATUS)!
    const client = {
      sendInquiryRequest: vi.fn(async () => undefined),
      getInquiryStatus: vi.fn(async () => ({
        outcome: SinkInquiryOutcome.NONE,
        requestId: 1,
        type: SinkInquiryType.GET_REVISION,
        responseClass: 0,
        responseType: 0,
        responseLength: 0,
      })),
      getInquiryResponse: vi.fn(async () => new Uint8Array()),
    }
    const onOpenChange = vi.fn()
    const view = render(<SourceInquiryDialog open onOpenChange={onOpenChange} definition={revision} client={client} />)
    await waitFor(() => expect(client.sendInquiryRequest).toHaveBeenCalledTimes(1))

    view.rerender(<SourceInquiryDialog open onOpenChange={onOpenChange} definition={statusDefinition} client={client} />)
    expect(screen.getByRole('alert')).toHaveTextContent('OCP, OVP, and OTP')
    expect(client.sendInquiryRequest).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'SEND INQUIRY' }))
    await waitFor(() => expect(client.sendInquiryRequest).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    view.rerender(<SourceInquiryDialog open={false} onOpenChange={onOpenChange} definition={statusDefinition} client={client} />)
    view.rerender(<SourceInquiryDialog open onOpenChange={onOpenChange} definition={statusDefinition} client={client} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(client.sendInquiryRequest).toHaveBeenCalledTimes(2)
  })

  it('surveys all advertised batteries and publishes one manufacturer identity event', async () => {
    const definition = ACTIVE_SOURCE_INQUIRIES.find(
      ({ type }) => type === SinkInquiryType.GET_MANUFACTURER_INFO,
    )!
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 24 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 24 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_MANUFACTURER_INFO, responseClass: 0, responseType: 7, responseLength: 8 },
    ]
    const scedb = new Uint8Array(24)
    scedb[22] = 0x01
    const responses = [
      scedb,
      new Uint8Array([0x34, 0x12, 0x78, 0x56, 0x41, 0x43, 0x4d, 0]),
    ]
    const publishLogEvent = vi.fn(async () => undefined)
    const onOpenChange = vi.fn()
    const view = render(
      <SourceInquiryDialog
        open
        onOpenChange={onOpenChange}
        definition={definition}
        client={{
          sendInquiryRequest: vi.fn(async () => undefined),
          getInquiryStatus: vi.fn(async () => statuses.shift()!),
          getInquiryResponse: vi.fn(async () => responses.shift()!),
        }}
        logOnly
        publishLogEvent={publishLogEvent}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Get manufacturer info…' })
    expect(dialog.querySelector('header')).not.toHaveTextContent('Ask for manufacturer identity')
    expect(screen.getByText('Ask for manufacturer identity for the Port or a battery reference.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' }).parentElement).toBe(
      screen.getByRole('button', { name: 'Send inquiry' }).parentElement,
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Target' }), {
      target: { value: 'BATTERY' },
    })
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }))

    await waitFor(() => expect(publishLogEvent).toHaveBeenCalledWith(
      'INQUIRY - Battery manufacturer identity',
      expect.stringContaining('Battery 0: VID 0x1234, PID 0x5678, manufacturer ACM.'),
    ))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    view.unmount()
  })

  it('discovers countries and fetches all sequentially with complete history', async () => {
    const countryDefinition = ACTIVE_SOURCE_INQUIRIES.find(({ type }) => type === SinkInquiryType.GET_COUNTRY_INFO)!
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.GET_COUNTRY_CODES, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_COUNTRY_CODES, responseClass: 0, responseType: 0x0e, responseLength: 6 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_COUNTRY_CODES, responseClass: 0, responseType: 0x0e, responseLength: 6 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_COUNTRY_INFO, responseClass: 0, responseType: 0x0d, responseLength: 4 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_COUNTRY_INFO, responseClass: 0, responseType: 0x0d, responseLength: 4 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 3, type: SinkInquiryType.GET_COUNTRY_INFO, responseClass: 0, responseType: 0x0d, responseLength: 4 },
    ]
    const responses = [
      new Uint8Array([2, 0, 0x43, 0x41, 0x55, 0x53]),
      new Uint8Array([0x43, 0x41, 0, 0]),
      new Uint8Array([0x55, 0x53, 0, 0]),
    ]
    const client = {
      sendInquiryRequest: vi.fn(async () => undefined),
      getInquiryStatus: vi.fn(async () => statuses.shift()!),
      getInquiryResponse: vi.fn(async () => responses.shift()!),
    }
    render(<SourceInquiryDialog open onOpenChange={vi.fn()} definition={countryDefinition} client={client} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Get all countries' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Get all countries' }))
    await waitFor(() => expect(client.sendInquiryRequest).toHaveBeenCalledTimes(3))
    expect(screen.getByText(/country-codes · attempt 1 · response/)).toBeInTheDocument()
    expect(screen.getByText(/country-info-CA · attempt 1 · response/)).toBeInTheDocument()
    expect(screen.getByText(/country-info-US · attempt 1 · response/)).toBeInTheDocument()
  })

  it('discovers SCEDB references then surveys Cap before Status', async () => {
    const definition = ACTIVE_SOURCE_INQUIRIES.find(({ id }) => id === 'survey-batteries')!
    const scedb = new Uint8Array(24); scedb[22] = 1
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 24 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 24 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_BATTERY_CAP, responseClass: 0, responseType: 5, responseLength: 9 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_BATTERY_CAP, responseClass: 0, responseType: 5, responseLength: 9 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 3, type: SinkInquiryType.GET_BATTERY_STATUS, responseClass: 2, responseType: 5, responseLength: 4 },
    ]
    const responses = [scedb, new Uint8Array(9), new Uint8Array(4)]
    const sendInquiryRequest = vi.fn<(request: SinkInquiryRequest) => Promise<void>>().mockResolvedValue(undefined)
    const client = { sendInquiryRequest, getInquiryStatus: vi.fn(async () => statuses.shift()!), getInquiryResponse: vi.fn(async () => responses.shift()!) }
    render(<SourceInquiryDialog open onOpenChange={vi.fn()} definition={definition} client={client} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Survey advertised batteries' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Survey advertised batteries' }))
    await waitFor(() => expect(client.sendInquiryRequest).toHaveBeenCalledTimes(3))
    expect(client.sendInquiryRequest.mock.calls.map(([request]) => request.type)).toEqual([
      SinkInquiryType.GET_SOURCE_CAP_EXTENDED, SinkInquiryType.GET_BATTERY_CAP, SinkInquiryType.GET_BATTERY_STATUS,
    ])
  })

  it('guides Identity through terminated SVID pages to selected Modes', async () => {
    const definition = ACTIVE_SOURCE_INQUIRIES.find(({ id }) => id === 'survey-port-partner-modes')!
    const words = (...values: number[]) => new Uint8Array(values.flatMap((value) => [value & 0xff, value >>> 8 & 0xff, value >>> 16 & 0xff, value >>> 24 & 0xff]))
    const header = (svid: number, command: number) => (svid << 16) | (1 << 15) | (1 << 13) | (1 << 6) | command
    const identity = words(header(0xff00, 1), 1, 2, 3)
    const svidPage = words(header(0xff00, 2), (0x1234 << 16) | 0xabcd, 0)
    const modes = words(header(0x1234, 3), 0xdeadbeef)
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.DISCOVER_IDENTITY, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.DISCOVER_IDENTITY, responseClass: 2, responseType: 0x0f, responseLength: 16 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.DISCOVER_IDENTITY, responseClass: 2, responseType: 0x0f, responseLength: 16 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.DISCOVER_SVIDS, responseClass: 2, responseType: 0x0f, responseLength: 12 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.DISCOVER_SVIDS, responseClass: 2, responseType: 0x0f, responseLength: 12 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 3, type: SinkInquiryType.DISCOVER_MODES, responseClass: 2, responseType: 0x0f, responseLength: 8 },
    ]
    const responses = [identity, svidPage, modes]
    const sendInquiryRequest = vi.fn<(request: SinkInquiryRequest) => Promise<void>>().mockResolvedValue(undefined)
    const client = { sendInquiryRequest, getInquiryStatus: vi.fn(async () => statuses.shift()!), getInquiryResponse: vi.fn(async () => responses.shift()!) }
    render(<SourceInquiryDialog open onOpenChange={vi.fn()} definition={definition} client={client} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discover selected SVID modes' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Discover selected SVID modes' }))
    await waitFor(() => expect(sendInquiryRequest).toHaveBeenCalledTimes(3))
    expect(sendInquiryRequest.mock.calls.map(([request]) => request.type)).toEqual([
      SinkInquiryType.DISCOVER_IDENTITY, SinkInquiryType.DISCOVER_SVIDS, SinkInquiryType.DISCOVER_MODES,
    ])
  })
})
