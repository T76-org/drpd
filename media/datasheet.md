# [Product Name]
## USB-C Power Delivery Analyzer and Programmable Sink

**Preliminary Datasheet**  
Document No.: DRPD-DS-2603  
Revision: A
Date: 2026-03-27

---

## Product overview

**Dr. PD** is a versatile USB-C Power Delivery analyzer and programmable sink for USB-C power systems. It provides comprehensive protocol analysis, real-time measurement of voltage and current, and the ability to act as a programmable sink to test source behavior under various conditions. It can also function as an inexpensive programmable power supply.

**Protocol analysis and VBUS measurement.** Dr. PD provides comprehensive visibility into USB Power Delivery communications with real-time protocol decoding, message-level detail, and synchronized VBUS voltage and current measurements. Users can perform deep dives into message analysis to understand negotiation flows, power profile requests, and protocol state transitions. The accompanying software includes detailed help and explanations to assist with protocol interpretation; making it accessible for both experienced USB-PD experts and those new to the standard.

**Programmable sink for device characterization.** In USB-C Power Delivery sink mode, you can use Dr. PD to characterize how chargers and sources respond to various power requests and operating conditions, as well as evaluate their capacity and battery performance. The programmable option allows engineers to emulate specific sink behavior, trigger faults, or test edge cases without requiring a dedicated test fixture. This capability also makes it suitable for acting as an inexpensive programmable power supply for development and testing scenarios where precise control over voltage and current is required.

**Full protocol compatibility.** Dr. PD supports standard power delivery (SPR), extended power range (EPR), and programmable power supply modes (PPS/AVS); enabling analysis and testing of modern USB-Power Delivery implementations up to 240 W. The instrument is designed to handle the full spectrum of USB-PD revisions and power profiles, supporting a wide range of commercial USB-C devices from low-power accessories to high-power computing and industrial applications.

**Sophisticated triggering capabilities.** The built-in trigger system allows users to capture and annotate specific protocol events, voltage transitions, or current thresholds with nanosecond accuracy. Triggers can be based on message types, device attach/detach events, power level changes, or external signals. The trigger system enables efficient identification of anomalies and data collection during extended monitoring sessions. This fine-grained control ensures that critical moments are never missed even in complex, long-duration power delivery scenarios.

### Key features

- **Bidirectional inline USB-C analysis:** capture and analyze USB-PD communications and correlate them with VBUS voltage and current measurements
- **Sophisticated search and trigger capabilities:** set triggers based on message types, device attach/detach events, power level changes, or external signals
- **Programmable USB-C sink mode:** emulate specific sink behavior, trigger faults, or test edge cases
- **PPS / EPR support up to 48V / 5A / 240W:** analyze and test modern USB-PD implementations
- **Real-time control software:** runs in Chrome or Edge on Windows, macOS, Linux, and Android. No drivers or installation required; just open the web app and connect the device.
- **First-class automation support:** Python and JavaScript host libraries for integration, plus support for industry-standard SCPI and USBTMC command interfaces
- **Open-source hardware, firmware, and software:** repairable, modifiable, and transparent design with schematics and source code available on GitHub under permissive licenses

---

## Hardware Specifications

| Category | Specs |
|---|---|
| CPU | Raspberry Pi RP2354 dual-core Cortex-M0+ microcontroller at 200 MHz |
| USB-PD controller | Implemented on the RP2354 with custom open-source firmware for real-time protocol analysis and sink control |
| Power requirements | Powered from host USB, 100 mA @ 5 V typical |
| External ports | Separate DUT and pass-through USB-C ports, banana jacks for external power and measurement access, dedicated CC tap for monitoring USB-PD communication, hardware sync, USB micro receptacle for host connection |
| VBUS voltage range | 0 - 60 V bidirectional, 10 mV resolution, ±1% full-scale accuracy (factory calibrated) * |
| VBUS current range | -5 - +5 A bidirectional, 10 mA resolution, ±2% full-scale accuracy (burden voltage 5mV/V, factory calibrated) * |
| Timestamp resolution | 1 µs |
| Sampling frequency | 200 MHz edge timing, 10 s/S for voltage/current |
| Triggering | Preamble start, message start, header start, message complete, message type, sender, protocol errors |
| External sync | Pulse high, pulse low, invert, pull-down. Latency max +20µs relative to event* |
| Protection | Programmable overvoltage and overcurrent. Independent protection for pass-through USB-C connection and banana connectors. ESD protection on all ports* |
| Operating temperature | 0ºC to 55ºC (32ºF to 131ºF) |
| Storage temperature | -20ºC to 70ºC (-4ºF to 158ºF) |
| Humidity | 5% to 90% RH non-condensing |
| Dimensions and weight | 35 mm x 135mm x 50 mm (5.3 in x 5.3 in x 2 in), 300 g (10.6 oz)* |

_* Preliminary typical specifications at 25ºC / 50% RH non-condensing. Subject to change._

## Protocol Support

| Category | Specs |
|---|---|
| Protocols supported | USB Power Delivery 2.0, 3.0, 3.1, 3.2 |
| SPR support | Yes |
| EPR support | Yes, up to 48 V / 5 A / 240 W |
| Decoding capabilities | Full protocol support including extended messages, chunked messages, and vendor-defined messages |
| Message decoding | Real-time human-readable protocol log with message-level detail and timing information |
| Message sources | SOP, SOP', SOP'', Debug SOP variants |

## Software Specifications

| Category | Specs |
|---|---|
| Host requirements | USB 2.0 port, Chrome or Edge browser, Windows 10 or higher / macOS Tahoe / Linux / Android |
| Device interfaces | Browser-based UI, text-based terminal app, Python and JavaScript host libraries, SCPI and USBTMC command interfaces |
| UI features | Protocol visualization, device control, multiple fully customizable layouts |
| Capture visualization | Real-time edge timing, voltage/current graphing, message details on click |
| Capture depth | Unlimited events and analog samples (only limited by host storage) |
| Capture search | Search by sender, receiver, message type, attach/detach events, custom annotations, and more |
| Energy measurement | Integrated current / energy calculation with resettable time tracker |
| Data export | Real-time CSV streaming, offline log download in CSV and JSON formats |
| Compatibility | Python, JavaScript, SCPI over USBTMC |
| Firmware updates | USB DFU over USB. New firmware versions can be uploaded directly from the web interface or using standard DFU tools. |
| Licensing | Hardware, firmware, and software are fully open-source under GPLv3 |
| Unlockable functions | **All functions are available at no additional cost and are subscription-free; all processing is done locally on the host to ensure privacy and security** |

## Sink Mode

| Category | Specs |
|---|---|
| Supported sink modes | Fixed voltage/current, PPS, AVS |
| Maximum requestable voltage/current/power | 48 V / 5 A / 240 W** |
| Request resolution | 10 mV / 100 mA*** |
| Additional features | Cable identification, ability to send arbitrary messages to the DUT |


_** Actual maximum requestable voltage/current/power may be limited by the protocol or the capabilities of the source under test and cable._

_*** Actual resolution may be limited by the protocol or the capabilities of the source under test._

