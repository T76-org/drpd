import { ControlMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'

/**
 * ReservedControl control message.
 */
export class ReservedControlMessage extends ControlMessage {
  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Reserved is a control message wrapper for undefined or reserved control message type values so decoding remains robust for unsupported or future message IDs.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * GoodCRC control message.
 */
export class GoodCRCMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('GoodCRC is a control acknowledgment message that confirms a message was received with a valid CRC so the sender can proceed without retransmission.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * GotoMin control message.
 */
export class GotoMinMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('GotoMin is a deprecated control message that requests transition to minimum operating power so legacy partners can reduce delivered power during constrained conditions.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * Accept control message.
 */
export class AcceptMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Accept is a control message that approves a prior request or command so negotiation or state transitions can continue on agreed terms.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * Reject control message.
 */
export class RejectMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Reject is a control message that declines a prior request or command so both partners can stop an unsupported or disallowed negotiation step.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * Ping control message.
 */
export class PingMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Ping is a control keepalive message from source to sink so contract continuity can be checked without changing negotiated power state.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * PSRDY control message.
 */
export class PSRDYMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('PS_RDY is a control readiness message indicating the requested power supply transition is complete so the sink can rely on the new power contract.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * GetSourceCap control message.
 */
export class GetSourceCapMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Get_Source_Cap is a control request message that asks the source to transmit Source_Capabilities so the sink can evaluate available power options.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * GetSinkCap control message.
 */
export class GetSinkCapMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Get_Sink_Cap is a control request message that asks the sink to transmit Sink_Capabilities so the source can understand sink requirements and preferences.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * DRSwap control message.
 */
export class DRSwapMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('DR_Swap is a control role-swap request that asks to exchange USB data roles so DFP and UFP responsibilities can be renegotiated.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * PRSwap control message.
 */
export class PRSwapMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('PR_Swap is a control role-swap request that asks to exchange power roles so source and sink roles can be reversed when policy allows.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * VCONNSwap control message.
 */
export class VCONNSwapMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('VCONN_Swap is a control role-swap request that asks to transfer VCONN sourcing responsibility so cable power responsibility can move between partners.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * Wait control message.
 */
export class WaitMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Wait is a control flow-control response that asks the requester to retry later so temporary policy or resource constraints can be resolved.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * SoftReset control message.
 */
export class SoftResetMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Soft_Reset is a control recovery message that resets protocol message state without a hard electrical reset so communication can resynchronize cleanly.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * DataReset control message.
 */
export class DataResetMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Data_Reset is a control recovery message used to clear data-related state so partners can restart data path assumptions in a known-safe way.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * DataResetComplete control message.
 */
export class DataResetCompleteMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Data_Reset_Complete is a control completion message confirming data reset handling is finished so normal protocol operation can resume.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * NotSupported control message.
 */
export class NotSupportedMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Not_Supported is a control response indicating the received message or command is not supported so the sender can fall back to a compatible path.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * GetSourceCapExtended control message.
 */
export class GetSourceCapExtendedMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Get_Source_Cap_Extended is a control request that asks for Source_Capabilities_Extended data so a sink can retrieve detailed source attributes.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * GetStatus control message.
 */
export class GetStatusMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Get_Status is a control request that asks the partner to send a Status extended message so current fault and operating state can be inspected.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * FRSwap control message.
 */
export class FRSwapMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('FR_Swap is a control request for fast role swap behavior so power role handoff can occur with minimal interruption during specific events.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * GetPPSStatus control message.
 */
export class GetPPSStatusMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Get_PPS_Status is a control request asking for PPS_Status data so a partner can monitor programmable power supply output and status conditions.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * GetCountryCodes control message.
 */
export class GetCountryCodesMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Get_Country_Codes is a control request that asks for supported country codes so region-specific country information can be requested afterward.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * GetSinkCapExtended control message.
 */
export class GetSinkCapExtendedMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Get_Sink_Cap_Extended is a control request that asks for Sink_Capabilities_Extended data so source policy can use richer sink capability details.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * GetSourceInfo control message.
 */
export class GetSourceInfoMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Get_Source_Info is a control request that asks for Source_Info data so a sink can query current source-side operating context.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}

/**
 * GetRevision control message.
 */
export class GetRevisionMessage extends ControlMessage {
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Get_Revision is a control request that asks for Revision data so partners can confirm protocol revision and related implementation context.', 'Message Description', 'A description of the message\'s function and usage.'))
    return metadata
  }
}
