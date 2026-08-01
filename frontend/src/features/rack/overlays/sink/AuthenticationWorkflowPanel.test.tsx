import 'reflect-metadata'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SinkInquiryOutcome, SinkInquiryType } from '../../../../lib/device'
import { AuthenticationWorkflowPanel } from './AuthenticationWorkflowPanel'

describe('AuthenticationWorkflowPanel', () => {
  it('allows inspect without an anchor and exposes real Retry/Continue/Stop controls', async () => {
    const client = {
      sendInquiryRequest: vi.fn(async () => undefined),
      getInquiryStatus: vi.fn()
        .mockResolvedValueOnce({ outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.GET_DIGESTS, responseClass: 0, responseType: 0, responseLength: 0 })
        .mockResolvedValue({ outcome: SinkInquiryOutcome.NOT_SUPPORTED, requestId: 1, type: SinkInquiryType.GET_DIGESTS, responseClass: 0, responseType: 0, responseLength: 0 }),
      getInquiryResponse: vi.fn(),
    }
    render(<AuthenticationWorkflowPanel client={client} />)
    expect(screen.getByText(/Trust and policy will be reported as not evaluated/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Authenticate source' }))
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(document.body.textContent).toContain('· stopped'))
    expect(client.sendInquiryRequest).toHaveBeenCalledWith({ type: SinkInquiryType.GET_DIGESTS })
  })

  it('disables require-anchor execution until an anchor is supplied', async () => {
    const client = { sendInquiryRequest: vi.fn(), getInquiryStatus: vi.fn(), getInquiryResponse: vi.fn() }
    render(<AuthenticationWorkflowPanel client={client} />)
    await userEvent.selectOptions(screen.getByLabelText('Authentication policy'), 'require-configured-anchor')
    expect(screen.getByRole('button', { name: 'Authenticate source' })).toBeDisabled()
  })
})
