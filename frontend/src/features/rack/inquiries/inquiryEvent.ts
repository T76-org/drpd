import {
  SinkInquiryCablePlug,
  SinkInquiryType,
  type LoggedEventDataSection,
  type SinkInquiryRequest,
} from '../../../lib/device'
import {
  parseManufacturerInfoDataBlock,
  parseCountryCodesDataBlock,
  parsePDO,
  parsePPSStatusDataBlock,
  parseRevisionDataObject,
  parseSOPPrimeStatusDataBlock,
  parseSOPStatusDataBlock,
  parseSourceCapabilitiesExtendedDataBlock,
  parseSourceInfoDataObject,
  readDataObjects,
  type ParsedPDO,
} from '../../../lib/device/drpd/usb-pd/DataObjects'
import {
  batteryReferencesFromScedb,
  binary,
  buildBatteryDiscoverySection,
  detailedValue,
  hex16,
  hex32,
  hex8,
  rawHexValue,
} from './batteryWorkflow'
import { decodeInquiryResponse } from './decode'
import { formatSinkInquiryOutcome } from './presentation'
import { runSinkInquiry, type InquiryRunState, type SinkInquiryClient } from './runner'

export interface InquiryEventResult {
  title: string
  summary: string
  eventData: LoggedEventDataSection[]
}

export const cablePlugLabel = (plug: SinkInquiryCablePlug): 'SOP′' | 'SOP″' =>
  plug === SinkInquiryCablePlug.SOP_PRIME ? 'SOP′' : 'SOP″'

const requestPlug = (request: SinkInquiryRequest): SinkInquiryCablePlug | undefined =>
  'plug' in request ? request.plug : request.type === SinkInquiryType.GET_MANUFACTURER_INFO && request.target !== 'PORT' && request.target !== 'BATTERY' ? request.target : undefined

export const inquiryEventTitle = (request: SinkInquiryRequest): string => {
  const plug = requestPlug(request)
  const target = plug ? `${cablePlugLabel(plug)} cable ` : ''
  switch (request.type) {
    case SinkInquiryType.GET_SOURCE_CAP: return 'INQUIRY - Source capabilities'
    case SinkInquiryType.GET_SOURCE_CAP_EXTENDED: return 'INQUIRY - Extended source capabilities'
    case SinkInquiryType.GET_STATUS: return plug ? `INQUIRY - ${target}status` : 'INQUIRY - Source status'
    case SinkInquiryType.GET_SOURCE_INFO: return 'INQUIRY - Source information'
    case SinkInquiryType.GET_PPS_STATUS: return 'INQUIRY - PPS status'
    case SinkInquiryType.GET_REVISION: return plug ? `INQUIRY - ${target}revision` : 'INQUIRY - Revision'
    case SinkInquiryType.GET_MANUFACTURER_INFO: return `INQUIRY - ${plug ? `${target}manufacturer identity` : request.target === 'PORT' ? 'Port manufacturer identity' : 'Battery manufacturer identity'}`
    case SinkInquiryType.GET_COUNTRY_CODES: return 'INQUIRY - Country codes'
    case SinkInquiryType.DISCOVER_IDENTITY: return `INQUIRY - ${target}identity`
    case SinkInquiryType.DISCOVER_SVIDS: return `INQUIRY - ${target}SVIDs`
    case SinkInquiryType.DISCOVER_MODES: return `INQUIRY - ${target}modes`
    default: return `INQUIRY - ${request.type.replaceAll('_', ' ').toLowerCase()}`
  }
}

const outcomeText = (result: InquiryRunState): string => {
  if (result.phase === 'terminal') return formatSinkInquiryOutcome(result.status.outcome)
  if (result.phase === 'transportError') return `Communication error: ${result.message}`
  if (result.phase === 'superseded') return `Superseded by request ${result.status.requestId}`
  if (result.phase === 'cancelled') return 'Cancelled'
  return `Incomplete (${result.phase})`
}

export const failedInquiryEvent = (
  request: SinkInquiryRequest,
  outcome: string,
  raw?: Uint8Array,
  decodeError?: string,
): InquiryEventResult => {
  const title = inquiryEventTitle(request)
  const plug = requestPlug(request)
  return {
    title,
    summary: [`- **Inquiry:** ${title.replace(/^INQUIRY - /, '')}`, `  - **Outcome:** ${outcome}.`, ...(plug ? [`  - **Target:** ${cablePlugLabel(plug)}`] : [])].join('\n'),
    eventData: [{
      title: 'Inquiry Result',
      entries: [
        { key: 'Outcome', value: outcome },
        ...(plug ? [{ key: 'Target', value: `**${cablePlugLabel(plug)}** — no fallback to SOP.` }] : []),
        ...(decodeError ? [{ key: 'Decode Error', value: decodeError }] : []),
        ...(raw ? [{ key: 'Raw Logical Response', value: detailedValue(rawHexValue(raw), 'Firmware-provided logical response body; no fabricated PD header or CRC is included.') }] : []),
      ],
    }],
  }
}

const pdoSummary = (pdo: ParsedPDO): string => {
  if (pdo.pdoType === 'FIXED') return `${(pdo.voltage50mV * 0.05).toFixed(2)} V at ${(pdo.current10mA * 0.01).toFixed(2)} A`
  if (pdo.pdoType === 'VARIABLE') return `${(pdo.minimumVoltage50mV * 0.05).toFixed(2)}–${(pdo.maximumVoltage50mV * 0.05).toFixed(2)} V at ${(pdo.current10mA * 0.01).toFixed(2)} A`
  if (pdo.pdoType === 'BATTERY') return `${(pdo.minimumVoltage50mV * 0.05).toFixed(2)}–${(pdo.maximumVoltage50mV * 0.05).toFixed(2)} V, ${(pdo.power250mW * 0.25).toFixed(2)} W`
  if (pdo.apdoType === 'SPR_PPS') return `${(pdo.minimumVoltage100mV * 0.1).toFixed(1)}–${(pdo.maximumVoltage100mV * 0.1).toFixed(1)} V at ${(pdo.maximumCurrent50mA * 0.05).toFixed(2)} A`
  if (pdo.apdoType === 'EPR_AVS') return `${(pdo.minimumVoltage100mV * 0.1).toFixed(1)}–${(pdo.maximumVoltage100mV * 0.1).toFixed(1)} V, ${pdo.pdp1W} W PDP`
  if (pdo.apdoType === 'SPR_AVS') return `${(pdo.maxCurrent15V10mA * 0.01).toFixed(2)} A at 15 V; ${(pdo.maxCurrent20V10mA * 0.01).toFixed(2)} A at 20 V`
  return 'Reserved APDO subtype'
}

const jsonValue = (value: unknown): string => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``

export const presentInquiryResponse = (request: SinkInquiryRequest, result: Extract<InquiryRunState, { phase: 'response' }>): InquiryEventResult => {
  decodeInquiryResponse(result.status, result.rawResponse, request)
  const raw = result.rawResponse
  const title = inquiryEventTitle(request)
  const plug = requestPlug(request)
  const targetEntry = plug ? [{ key: 'Target', value: `**${cablePlugLabel(plug)}** — explicitly addressed; no fallback to SOP.` }] : []
  const rawEntry = { key: 'Raw Logical Response', value: detailedValue(rawHexValue(raw), 'Complete logical response body; no fabricated USB-PD header or CRC is included.') }

  if (request.type === SinkInquiryType.GET_SOURCE_CAP) {
    const words = readDataObjects(raw, 0, raw.length / 4)
    const pdos = words.map((word) => parsePDO(word, 'source'))
    return {
      title,
      summary: [`- **Advertised source capabilities:** ${pdos.length} PDO${pdos.length === 1 ? '' : 's'}.`, ...pdos.flatMap((pdo, index) => [`- **PDO ${index + 1} (${pdo.pdoType}${pdo.pdoType === 'APDO' ? `/${pdo.apdoType}` : ''}):**`, `  - **Capability:** ${pdoSummary(pdo)}`])].join('\n'),
      eventData: [{ title: 'Source Capabilities', entries: [
        { key: 'PDO Count', value: `${pdos.length}` },
        ...pdos.map((pdo, index) => ({
          key: `PDO ${index + 1} — ${pdo.pdoType}${pdo.pdoType === 'APDO' ? `/${pdo.apdoType}` : ''}`,
          value: `**${pdoSummary(pdo)}**\n\nRaw: \`${hex32(pdo.raw)}\`; bytes ${rawHexValue(raw.subarray(index * 4, index * 4 + 4))}.\n\n${jsonValue(pdo)}`,
        })),
        rawEntry,
      ] }],
    }
  }

  if (request.type === SinkInquiryType.GET_SOURCE_CAP_EXTENDED) {
    const block = parseSourceCapabilitiesExtendedDataBlock(raw)
    const references = batteryReferencesFromScedb(raw)
    return {
      title,
      summary: [
        '- **Extended source capabilities:**',
        `  - **VID:** ${hex16(block.vid)}`,
        `  - **PID:** ${hex16(block.pid)}`,
        `  - **SPR Source PDP:** ${block.sprSourcePdpRating} W`,
        `  - **EPR Source PDP:** ${block.eprSourcePdpRating === null ? 'Not reported' : `${block.eprSourcePdpRating} W`}`,
        `  - **Advertised batteries:** ${references.length}`,
      ].join('\n'),
      eventData: [buildBatteryDiscoverySection(block, raw, references)],
    }
  }

  if (request.type === SinkInquiryType.GET_STATUS) {
    if (plug) {
      const status = parseSOPPrimeStatusDataBlock(raw)
      return { title, summary: [`- **${cablePlugLabel(plug)} cable status:**`, `  - **Internal temperature:** ${status.internalTemp >= 2 ? `${status.internalTemp} °C` : status.internalTemp === 1 ? 'Below 2 °C' : 'Not supported'}`, `  - **Thermal shutdown:** ${(status.flags & 1) !== 0 ? 'Yes' : 'No'}`].join('\n'), eventData: [{ title: `${cablePlugLabel(plug)} Cable Status`, entries: [...targetEntry, { key: 'Internal Temperature (byte 0)', value: `${hex8(status.internalTemp)} — ${status.internalTemp >= 2 ? `${status.internalTemp} °C` : status.internalTemp === 1 ? 'below 2 °C' : 'not supported'}.` }, { key: 'Flags (byte 1)', value: `\`${hex8(status.flags)}\` (${binary(status.flags, 8)}); bit 0 thermal shutdown = ${(status.flags & 1) !== 0}; bits 7:1 reserved.` }, rawEntry] }] }
    }
    const status = parseSOPStatusDataBlock(raw)
    return { title, summary: ['- **Source status:**', `  - **Internal temperature:** ${status.internalTemp} °C`, `  - **Present input:** ${hex8(status.presentInput)}`, `  - **Event flags:** ${hex8(status.eventFlags)}`, `  - **Temperature status:** ${hex8(status.temperatureStatus)}`, `  - **Power status:** ${hex8(status.powerStatus)}`, `  - **Power state change:** ${status.powerStateChange === null ? 'Not present' : hex8(status.powerStateChange)}`].join('\n'), eventData: [{ title: 'Source Status', entries: [{ key: 'Data Block Length', value: `${raw.length} bytes` }, ...Object.entries(status).map(([key, value]) => ({ key, value: typeof value === 'number' ? `\`${hex8(value)}\` (${binary(value, 8)})` : String(value) })), rawEntry] }] }
  }

  if (request.type === SinkInquiryType.GET_SOURCE_INFO) {
    const word = readDataObjects(raw, 0, 1)[0]
    const info = parseSourceInfoDataObject(word)
    return { title, summary: ['- **Source information:**', `  - **Port type:** ${info.portType === 0 ? 'Type-C' : 'Reserved'}`, `  - **Maximum PDP:** ${info.portMaximumPdp} W`, `  - **Present PDP:** ${info.portPresentPdp} W`, `  - **Reported PDP:** ${info.portReportedPdp} W`].join('\n'), eventData: [{ title: 'Source Information', entries: [{ key: 'Port Type (bit 31)', value: `${binary(info.portType, 1)} — ${info.portType === 0 ? 'Type-C' : 'reserved'}.` }, { key: 'Reserved (bits 30:24)', value: `${binary((word >>> 24) & 0x7f, 7)} — must be zero.` }, { key: 'Port Maximum PDP (bits 23:16)', value: `${info.portMaximumPdp} W` }, { key: 'Port Present PDP (bits 15:8)', value: `${info.portPresentPdp} W` }, { key: 'Port Reported PDP (bits 7:0)', value: `${info.portReportedPdp} W` }, { key: 'Raw Data Object', value: `\`${hex32(word)}\`` }, rawEntry] }] }
  }

  if (request.type === SinkInquiryType.GET_PPS_STATUS) {
    const status = parsePPSStatusDataBlock(raw)
    const voltage = status.outputVoltageSupported ? `${(status.outputVoltage20mV * 0.02).toFixed(2)} V` : 'Not supported'
    const current = status.outputCurrentSupported ? `${(status.outputCurrent50mA * 0.05).toFixed(2)} A` : 'Not supported'
    return { title, summary: ['- **PPS status:**', `  - **Output voltage:** ${voltage}`, `  - **Output current:** ${current}`, `  - **Current limited:** ${(status.realTimeFlags & 0x08) !== 0 ? 'Yes' : 'No'}`, `  - **Temperature limited:** ${(status.realTimeFlags & 0x04) !== 0 ? 'Yes' : 'No'}`].join('\n'), eventData: [{ title: 'PPS Status', entries: [{ key: 'Output Voltage (bytes 0–1)', value: `${voltage}; raw ${hex16(status.outputVoltage20mV)} in 20 mV units; 0xFFFF means unsupported.` }, { key: 'Output Current (byte 2)', value: `${current}; raw ${hex8(status.outputCurrent50mA)} in 50 mA units; 0xFF means unsupported.` }, { key: 'Real-Time Flags (byte 3)', value: `\`${hex8(status.realTimeFlags)}\` (${binary(status.realTimeFlags, 8)}); bit 3 current limited; bit 2 temperature limited; remaining bits reserved.` }, rawEntry] }] }
  }

  if (request.type === SinkInquiryType.GET_REVISION) {
    const word = readDataObjects(raw, 0, 1)[0]
    const revision = parseRevisionDataObject(word)
    return { title, summary: [`- **${plug ? `${cablePlugLabel(plug)} cable revision` : 'Revision'}:**`, `  - **Revision:** ${revision.revisionMajor}.${revision.revisionMinor}`, `  - **Version:** ${revision.versionMajor}.${revision.versionMinor}`].join('\n'), eventData: [{ title: `${plug ? `${cablePlugLabel(plug)} Cable ` : ''}Revision`, entries: [...targetEntry, { key: 'Revision Major (bits 31:28)', value: `${revision.revisionMajor}` }, { key: 'Revision Minor (bits 27:24)', value: `${revision.revisionMinor}` }, { key: 'Version Major (bits 23:20)', value: `${revision.versionMajor}` }, { key: 'Version Minor (bits 19:16)', value: `${revision.versionMinor}` }, { key: 'Reserved (bits 15:0)', value: `\`${hex16(word & 0xffff)}\` — must be zero.` }, { key: 'Raw Data Object', value: `\`${hex32(word)}\`` }, rawEntry] }] }
  }

  if (request.type === SinkInquiryType.GET_MANUFACTURER_INFO) {
    const info = parseManufacturerInfoDataBlock(raw)
    return { title, summary: [`- **${plug ? `${cablePlugLabel(plug)} cable manufacturer identity` : 'Port manufacturer identity'}:**`, `  - **VID:** ${hex16(info.vid)}`, `  - **PID:** ${hex16(info.pid)}`, `  - **Manufacturer:** ${info.manufacturerString || '(empty)'}`, ...(plug ? [`  - **Target:** ${cablePlugLabel(plug)}`] : [])].join('\n'), eventData: [{ title: `${plug ? `${cablePlugLabel(plug)} Cable ` : 'Port '}Manufacturer Identity`, entries: [...targetEntry, { key: 'Vendor ID (bytes 0–1)', value: `**${hex16(info.vid)}**; raw little-endian bytes ${rawHexValue(raw.subarray(0, 2))}.` }, { key: 'Product ID (bytes 2–3)', value: `**${hex16(info.pid)}**; raw little-endian bytes ${rawHexValue(raw.subarray(2, 4))}.` }, { key: 'Manufacturer String (bytes 4–end)', value: `**${info.manufacturerString || '(empty)'}**; null-terminated bytes ${rawHexValue(info.manufacturerStringBytes)}.` }, rawEntry] }] }
  }

  if (request.type === SinkInquiryType.GET_COUNTRY_CODES) {
    const block = parseCountryCodesDataBlock(raw)
    return {
      title,
      summary: [
        `- **Advertised countries:** ${block.countryCodes.length} total.`,
        ...block.countryCodes.flatMap((code, index) => [
          `- **Country ${index + 1}:** ${code}`,
          `  - **Wire order:** ${index + 1}`,
        ]),
      ].join('\n'),
      eventData: [{
        title: 'Country Codes',
        entries: [
          { key: 'Advertised Count (byte 0)', value: `${block.length}` },
          { key: 'Reserved (byte 1)', value: `\`${hex8(raw[1] ?? 0)}\` — reserved.` },
          ...block.countryCodes.map((code, index) => ({
            key: `Country ${index + 1} (bytes ${index * 2 + 2}–${index * 2 + 3})`,
            value: `**${code}**; encoded bytes ${rawHexValue(raw.subarray(index * 2 + 2, index * 2 + 4))}.`,
          })),
          rawEntry,
        ],
      }],
    }
  }

  const decoded = decodeInquiryResponse(result.status, raw, request)
  return { title, summary: [`- **Inquiry:** ${title.replace(/^INQUIRY - /, '')}`, '  - **Outcome:** Response decoded successfully.', ...(plug ? [`  - **Target:** ${cablePlugLabel(plug)}`] : [])].join('\n'), eventData: [{ title: 'Decoded Response', entries: [...targetEntry, { key: 'Decoded Fields', value: `\`\`\`json\n${decoded.summary}\n\`\`\`` }, rawEntry] }] }
}

export const runSingleInquiryEvent = async (
  client: SinkInquiryClient,
  request: SinkInquiryRequest,
): Promise<InquiryEventResult> => {
  const result = await runSinkInquiry(client, request)
  if (result.phase !== 'response') return failedInquiryEvent(request, outcomeText(result), result.phase === 'terminal' ? result.rawResponse : undefined)
  try {
    return presentInquiryResponse(request, result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return failedInquiryEvent(request, 'Malformed response', result.rawResponse, message)
  }
}
