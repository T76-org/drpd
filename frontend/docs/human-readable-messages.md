# Human-Readable USB-PD Message Summaries

This catalog covers the first implementation target for per-message, instance-specific summaries in the frontend USB-PD decoder.

The new field should live in each decoded message's Base Information section, after the existing message type and static message description fields. The field should be derived from the decoded payload for the specific captured message. It should omit protocol facts that are true for every message of the same type.

Proposed field:

- Key: `messageSummary`
- Label: `Message Summary`
- Type: string or multiline string field, depending on the final renderer support
- Placement: Base Information, after `messageDescription` and before `usbPdReference`

Control messages are intentionally excluded because they do not carry payload data. Only data messages and extended messages are in scope.

## Writing Rules

- Describe only the salient facts present in this message instance.
- Prefer interpreted units over raw fields: volts, amps, watts, country codes, VID/PID, command names.
- Group repeated payload entries, such as PDOs or country codes, instead of narrating each raw object field.
- Include important asserted flags, warnings, errors, and capabilities.
- Omit inactive flags unless their absence is unusually meaningful for that message type.
- Fall back to a concise raw-payload statement when a message class preserves data without a specific parser.
- If parsing fails, include a short "Could not decode ..." sentence with the parse error and avoid fabricated details.

## Data Messages

- [ ] `Reserved` (`ReservedDataMessage`)
  - Payload: Raw 32-bit data objects for undefined or reserved data message type values.
  - Summary: Raw object count and raw object values.
- [x] `Source_Capabilities` (`SourceCapabilitiesMessage`)
  - Payload: Source PDO list.
  - Summary: Fixed, variable, battery, PPS, SPR AVS, and EPR AVS source profiles; EPR support from the fixed PDO; notable source flags such as dual-role power/data, USB communications, unchunked extended messages, unconstrained power, peak-current codes, and power-limited PPS.
- [x] `Request` (`RequestMessage`)
  - Payload: One Request Data Object.
  - Summary: Referenced object position; interpreted request level for fixed/variable, battery, PPS, or AVS requests; maximum/operating current or power; capability mismatch; USB communications/no-suspend flags; unchunked extended-message support; EPR capability.
- [ ] `BIST` (`BISTMessage`)
  - Payload: BIST Data Object plus any additional raw objects.
  - Summary: BIST mode name/value and any additional raw objects.
- [x] `Sink_Capabilities` (`SinkCapabilitiesMessage`)
  - Payload: Sink PDO list.
  - Summary: Fixed, variable, battery, PPS, SPR AVS, and EPR AVS sink profiles; sink flags such as dual-role power/data, USB communications, higher capability, unconstrained power, and Fast Role Swap required current.
- [x] `Battery_Status` (`BatteryStatusMessage`)
  - Payload: Battery Status Data Object.
  - Summary: Battery present capacity, battery presence, invalid battery reference, and charging/discharging/idle status.
- [x] `Alert` (`AlertMessage`)
  - Payload: Alert Data Object.
  - Summary: Active alert flags, affected fixed and hot-swappable battery slots, and extended alert event type when present.
- [x] `Get_Country_Info` (`GetCountryInfoMessage`)
  - Payload: Country Code Data Object.
  - Summary: Requested two-character country code, or raw character bytes when they are not printable.
- [x] `Enter_USB` (`EnterUSBMessage`)
  - Payload: Enter USB Data Object.
  - Summary: Requested USB mode, USB4/USB3 DRD capability, cable speed/type/current, PCIe/DisplayPort/Thunderbolt support, and host-present flag.
- [x] `EPR_Request` (`EPRRequestMessage`)
  - Payload: EPR Request Data Object and copied requested PDO.
  - Summary: Requested EPR object position; interpreted request voltage/current or power; requested PDO profile; capability mismatch; EPR and unchunked extended-message flags.
- [x] `EPR_Mode` (`EPRModeMessage`)
  - Payload: EPR Mode Data Object.
  - Summary: EPR action name and action-specific data, including enter PDP or failure reason when applicable.
- [x] `Source_Info` (`SourceInfoMessage`)
  - Payload: Source Info Data Object.
  - Summary: Managed vs guaranteed port type, maximum PDP, present PDP, and reported PDP.
- [x] `Revision` (`RevisionMessage`)
  - Payload: Revision Data Object.
  - Summary: Revision major/minor and version major/minor.
- [x] `Vendor_Defined` (`VendorDefinedMessage`)
  - Payload: VDM header plus VDOs.
  - Summary: SVID, structured vs unstructured VDM, command type/name, object position, discovered identity details, SVID list, mode list, command payload VDO count, parse errors, or raw VDO values when the command is not specifically decoded.

## Extended Messages

- [ ] `Reserved` (`ReservedExtendedMessage`)
  - Payload: Raw extended payload bytes for undefined or reserved extended message type values.
  - Summary: Payload byte count, chunking state, and a short hex preview.
- [ ] `Source_Capabilities_Extended` (`SourceCapabilitiesExtendedMessage`)
  - Payload: Source Capabilities Extended Data Block.
  - Summary: VID/PID/XID, firmware/hardware versions, voltage regulation, compliance/touch-current attributes, peak-current fields, source input sources, battery-slot bitfields, and SPR/EPR PDP ratings.
- [ ] `Status` (`StatusMessage`)
  - Payload: SOP Status Data Block or SOP'/SOP'' Status Data Block.
  - Summary: Internal temperature, active input sources, active event flags such as OCP/OTP/OVP/CL mode, temperature status, power-limitation reasons, power-state change, or cable-plug flags for SOP'/SOP''.
- [ ] `Get_Battery_Cap` (`GetBatteryCapMessage`)
  - Payload: Battery capability reference.
  - Summary: Requested battery reference.
- [ ] `Get_Battery_Status` (`GetBatteryStatusMessage`)
  - Payload: Battery status reference.
  - Summary: Requested battery reference.
- [ ] `Battery_Capabilities` (`BatteryCapabilitiesMessage`)
  - Payload: Battery Capabilities Data Block.
  - Summary: VID/PID, design capacity, last full-charge capacity, and battery type/invalid-reference flag.
- [ ] `Get_Manufacturer_Info` (`GetManufacturerInfoMessage`)
  - Payload: Manufacturer info target and reference.
  - Summary: Target type and manufacturer info reference.
- [ ] `Manufacturer_Info` (`ManufacturerInfoMessage`)
  - Payload: Manufacturer Info Data Block.
  - Summary: VID/PID and manufacturer string, with byte count or fallback preview for non-printable data.
- [ ] `Security_Request` (`SecurityRequestMessage`)
  - Payload: Security request payload bytes.
  - Summary: Payload byte count, chunking state, and a short hex preview.
- [ ] `Security_Response` (`SecurityResponseMessage`)
  - Payload: Security response payload bytes.
  - Summary: Payload byte count, chunking state, and a short hex preview.
- [ ] `Firmware_Update_Request` (`FirmwareUpdateRequestMessage`)
  - Payload: Firmware update request payload bytes.
  - Summary: Payload byte count, chunking state, and a short hex preview.
- [ ] `Firmware_Update_Response` (`FirmwareUpdateResponseMessage`)
  - Payload: Firmware update response payload bytes.
  - Summary: Payload byte count, chunking state, and a short hex preview.
- [ ] `PPS_Status` (`PPSStatusMessage`)
  - Payload: PPS Status Data Block.
  - Summary: Output voltage, output current, temperature flag, and operating mode flag.
- [ ] `Country_Info` (`CountryInfoMessage`)
  - Payload: Country Info Data Block.
  - Summary: Country code, country-specific data byte count, and ASCII preview when printable.
- [ ] `Country_Codes` (`CountryCodesMessage`)
  - Payload: Country Codes Data Block.
  - Summary: Number of country codes and the decoded country code list.
- [ ] `Sink_Capabilities_Extended` (`SinkCapabilitiesExtendedMessage`)
  - Payload: Sink Capabilities Extended Data Block.
  - Summary: VID/PID/XID, firmware/hardware versions, SKEDB version, load-step characteristics, compliance/touch-temp data, battery-slot bitfields, sink modes, and SPR/EPR min/operational/max PDP ratings.
- [x] `Extended_Control` (`ExtendedControlMessage`)
  - Payload: Extended Control Data Block.
  - Summary: Extended-control type name, sender/valid-SOP interpretation, and data-byte meaning.
- [x] `EPR_Source_Capabilities` (`EPRSourceCapabilitiesMessage`)
  - Payload: SPR and EPR source PDO list in an extended message.
  - Summary: Source profiles grouped by fixed, variable, battery, PPS, SPR AVS, and EPR AVS; distinguish SPR vs EPR entries; include EPR support and salient source flags.
- [ ] `EPR_Sink_Capabilities` (`EPRSinkCapabilitiesMessage`)
  - Payload: SPR and EPR sink PDO list in an extended message.
  - Summary: Sink profiles grouped by fixed, variable, battery, PPS, SPR AVS, and EPR AVS; distinguish SPR vs EPR entries; include sink capabilities and salient flags.
- [ ] `Vendor_Defined_Extended` (`VendorDefinedExtendedMessage`)
  - Payload: VDM header plus vendor payload bytes.
  - Summary: SVID, structured vs unstructured VDM, command type/name when present, vendor payload byte count, chunking state, and a short hex preview.

## Out of Scope

The following mapped message types should not get the new field in this feature because they are control messages with no payload data:

- `Reserved`
- `GoodCRC`
- `GotoMin`
- `Accept`
- `Reject`
- `Ping`
- `PS_RDY`
- `Get_Source_Cap`
- `Get_Sink_Cap`
- `DR_Swap`
- `PR_Swap`
- `VCONN_Swap`
- `Wait`
- `Soft_Reset`
- `Data_Reset`
- `Data_Reset_Complete`
- `Not_Supported`
- `Get_Source_Cap_Extended`
- `Get_Status`
- `FR_Swap`
- `Get_PPS_Status`
- `Get_Country_Codes`
- `Get_Sink_Cap_Extended`
- `Get_Source_Info`
- `Get_Revision`
