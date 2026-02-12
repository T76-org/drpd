import { ControlMessage } from '../messageBase'

/**
 * ReservedControl control message.
 */
export class ReservedControlMessage extends ControlMessage {}

/**
 * GoodCRC control message.
 */
export class GoodCRCMessage extends ControlMessage {}

/**
 * GotoMin control message.
 */
export class GotoMinMessage extends ControlMessage {}

/**
 * Accept control message.
 */
export class AcceptMessage extends ControlMessage {}

/**
 * Reject control message.
 */
export class RejectMessage extends ControlMessage {}

/**
 * Ping control message.
 */
export class PingMessage extends ControlMessage {}

/**
 * PSRDY control message.
 */
export class PSRDYMessage extends ControlMessage {}

/**
 * GetSourceCap control message.
 */
export class GetSourceCapMessage extends ControlMessage {}

/**
 * GetSinkCap control message.
 */
export class GetSinkCapMessage extends ControlMessage {}

/**
 * DRSwap control message.
 */
export class DRSwapMessage extends ControlMessage {}

/**
 * PRSwap control message.
 */
export class PRSwapMessage extends ControlMessage {}

/**
 * VCONNSwap control message.
 */
export class VCONNSwapMessage extends ControlMessage {}

/**
 * Wait control message.
 */
export class WaitMessage extends ControlMessage {}

/**
 * SoftReset control message.
 */
export class SoftResetMessage extends ControlMessage {}

/**
 * DataReset control message.
 */
export class DataResetMessage extends ControlMessage {}

/**
 * DataResetComplete control message.
 */
export class DataResetCompleteMessage extends ControlMessage {}

/**
 * NotSupported control message.
 */
export class NotSupportedMessage extends ControlMessage {}

/**
 * GetSourceCapExtended control message.
 */
export class GetSourceCapExtendedMessage extends ControlMessage {}

/**
 * GetStatus control message.
 */
export class GetStatusMessage extends ControlMessage {}

/**
 * FRSwap control message.
 */
export class FRSwapMessage extends ControlMessage {}

/**
 * GetPPSStatus control message.
 */
export class GetPPSStatusMessage extends ControlMessage {}

/**
 * GetCountryCodes control message.
 */
export class GetCountryCodesMessage extends ControlMessage {}

/**
 * GetSinkCapExtended control message.
 */
export class GetSinkCapExtendedMessage extends ControlMessage {}

/**
 * GetSourceInfo control message.
 */
export class GetSourceInfoMessage extends ControlMessage {}

/**
 * GetRevision control message.
 */
export class GetRevisionMessage extends ControlMessage {}

