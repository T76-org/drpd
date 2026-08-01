import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SinkInquiryOutcome, SinkInquiryType } from '../../../../lib/device'
import { ACTIVE_SOURCE_INQUIRIES } from '../../inquiries/catalog'
import { formatSinkInquiryOutcome } from '../../inquiries/presentation'
import { SourceInquiryDialog } from './SourceInquiryDialog'

describe('SourceInquiryDialog', () => {
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
        definition={ACTIVE_SOURCE_INQUIRIES[0]}
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
        definition={ACTIVE_SOURCE_INQUIRIES[0]}
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
})
