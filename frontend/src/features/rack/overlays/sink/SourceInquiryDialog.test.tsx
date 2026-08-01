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
    fireEvent.click(screen.getByRole('button', { name: 'Send Get_Status' }))
    await waitFor(() => expect(client.sendInquiryRequest).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    view.rerender(<SourceInquiryDialog open={false} onOpenChange={onOpenChange} definition={statusDefinition} client={client} />)
    view.rerender(<SourceInquiryDialog open onOpenChange={onOpenChange} definition={statusDefinition} client={client} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(client.sendInquiryRequest).toHaveBeenCalledTimes(2)
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
})
