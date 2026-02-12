/**
 * USB-PD SOP kinds decoded from ordered sets.
 */
export type SOPKind =
  | 'SOP'
  | 'SOP_PRIME'
  | 'SOP_DOUBLE_PRIME'
  | 'SOP_DEBUG_PRIME'
  | 'SOP_DEBUG_DOUBLE_PRIME'
  | 'SOP_HARD_RESET'
  | 'SOP_CABLE_RESET'
  | 'UNKNOWN'

/**
 * USB-PD message kind classification.
 */
export type MessageKind = 'CONTROL' | 'DATA' | 'EXTENDED'

/**
 * USB-PD power role field (SOP only).
 */
export type PowerRole = 'SOURCE' | 'SINK'

/**
 * USB-PD data role field (SOP only).
 */
export type DataRole = 'DFP' | 'UFP'

/**
 * USB-PD cable plug field (SOP'/SOP'' only).
 */
export type CablePlug = 'UFP_DFP' | 'CABLE_PLUG_VPD'

/**
 * Parsed message header fields.
 */
export interface MessageHeaderFields {
  ///< Extended flag from Message Header bit 15.
  extended: boolean
  ///< Number of Data Objects from Message Header bits 14..12.
  numberOfDataObjects: number
  ///< Message ID from Message Header bits 11..9.
  messageId: number
  ///< Message type number from Message Header bits 4..0.
  messageTypeNumber: number
  ///< Derived message kind based on Extended and Number of Data Objects.
  messageKind: MessageKind
  ///< Specification revision bits from Message Header bits 7..6.
  specRevisionBits: number
  ///< Port power role (SOP only).
  powerRole: PowerRole | null
  ///< Port data role (SOP only).
  dataRole: DataRole | null
  ///< Cable plug indication (SOP' and SOP'' only).
  cablePlug: CablePlug | null
}

/**
 * Parsed extended message header fields.
 */
export interface ExtendedMessageHeaderFields {
  ///< Chunked flag from Extended Header bit 15.
  chunked: boolean
  ///< Chunk number from Extended Header bits 14..11.
  chunkNumber: number
  ///< Request chunk flag from Extended Header bit 10.
  requestChunk: boolean
  ///< Data size from Extended Header bits 8..0.
  dataSize: number
}

/**
 * Message type definition used for mapping message type numbers to classes.
 */
export interface MessageTypeDefinition {
  ///< Human-readable message type name.
  name: string
}
