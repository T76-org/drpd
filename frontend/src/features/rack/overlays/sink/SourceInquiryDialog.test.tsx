import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SinkInquiryOutcome, SinkInquiryType } from '../../../../lib/device'
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
})
