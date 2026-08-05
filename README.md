# Dr. PD - Open-source USB Power Delivery Analyzer and Programmable Sink

![DRPD Case Render](./media/front.png)

Dr. PD is a fully-featured USB Power Delivery (USB-PD) analyzer and programmable sink. It is designed to help characterize and troubleshoot USB-PD devices like chargers, cables, and sink devices. 

> [!NOTE]
> **Dr. PD will be available for crowdfunding soon through Crowd Supply.** Visit our [prelaunch page](https://www.crowdsupply.com/t76-org/dr-pd) to sign up and receive updates on the project, including the crowdfunding launch.

## Features

Dr. PD can capture and decode USB-PD messages, measure voltage and current, and even emulate a USB-PD sink device to test chargers and cables under various conditions.

You can find out more about its features in the [online datasheet](./media/datasheet.md), but here are some important highlights:

### USB-PD protocol analysis

- Real-time message decoding with detailed protocol analysis
- Correlation of messages with VBUS voltage and current measurements
- Sophisticated search and trigger capabilities based on message types, device attach/detach events, power level changes, or external signals

### Programmable sink mode

- Emulate specific sink behavior, trigger faults, or test edge cases without a dedicated test fixture
- Analyze and test modern USB-PD implementations **up to 48V / 5A / 240W** with support for standard power delivery (SPR), extended power range (EPR), and programmable power supply modes (PPS/AVS)

### Software

- Real-time control software that runs in Chrome or Edge on Windows, macOS, Linux, and Android with no drivers or installation required
- First-class automation support with Python and JavaScript host libraries, plus support for industry-standard SCPI and USBTMC command interfaces
- Open-source hardware, firmware, and software with schematics and source code available on in this repo
- USB-PD stack implemented in firmware (instead of depending on a dedicated external chip) for maximum flexibility and updatability

## Documentation

You can access the full documentation for Dr. PD [on the T76 website](https://t76.org/drpd/docs). The documentation includes a user manual, hardware and firmware design files, and software API references.

Downloadable hardware schematics in PDF and KiCAD format are available in the [hardware folder](./hardware) of this repository. The current hardware version is [R2605-A](./hardware/R2605-A).

**Interactive online schematics and PCB layout** are available in [the docs](https://t76.org/drpd/docs/category/internals), which also contain a detailed, step-by-step description of the hardware design.

## Screenshots

Click on the images below to view them in full size.

<table width="810">
  <tr>
    <td width="270" align="center"><a href="./media/front.png"><img src="./media/front.png" alt="Dr. PD front panel" width="250"></a></td>
    <td width="270" align="center"><a href="./media/back.jpg"><img src="./media/back.jpg" alt="Dr. PD back panel" width="250"></a></td>
    <td width="270" align="center"><a href="./media/drpd-main-ui.png"><img src="./media/drpd-main-ui.png" alt="Dr. PD main interface" width="250"></a></td>
  </tr>
  <tr>
    <td width="270" align="left" valign="top"><sub><strong>Front panel</strong></sub></td>
    <td width="270" align="left" valign="top"><sub><strong>Back panel</strong></sub></td>
    <td width="270" align="left" valign="top"><sub>The <strong>Main interface</strong> runs in your browser and shows live analog measurement, message capture, and analysis.</sub></td>
  </tr>
  <tr>
    <td width="270" align="center"><a href="./media/drpd-message-detail.png"><img src="./media/drpd-message-detail.png" alt="USB-PD message details" width="250"></a></td>
    <td width="270" align="center"><a href="./media/drpd-sink-inquiry.png"><img src="./media/drpd-sink-inquiry.png" alt="Sink inquiry workflow" width="250"></a></td>
    <td width="270" align="center"><a href="./media/drpd-source-debugging.png"><img src="./media/drpd-source-debugging.png" alt="Source debugging workflow" width="250"></a></td>
  </tr>
  <tr>
    <td width="270" align="left" valign="top"><sub>The <strong>Message Detail</strong> breaks down each message into its constituent fields, timing data, CRC checks, and specification references.</sub></td>
    <td width="270" align="left" valign="top"><sub>In <strong>Sink Mode</strong>, Dr. PD can interrogate the source by sending arbitrary messages to it.</sub></td>
    <td width="270" align="left" valign="top"><sub><strong>Source debugging:</strong> Dr. PD can correlate protocol traffic, electrical activity, errors, and recovery attempts to help troubleshoot connectivity between sources and sinks.</sub></td>
  </tr>
  <tr>
    <td width="270" align="center"><a href="./media/drpd-source-malformed-response.png"><img src="./media/drpd-source-malformed-response.png" alt="Malformed source response analysis" width="250"></a></td>
    <td width="270" align="center"><a href="./media/drpd-filter-ui.png"><img src="./media/drpd-filter-ui.png" alt="Message log filters" width="250"></a></td>
    <td width="270" align="center"><a href="./media/drpd-trigger-setup-ui.png"><img src="./media/drpd-trigger-setup-ui.png" alt="Capture trigger setup" width="250"></a></td>
  </tr>
  <tr>
    <td width="270" align="left" valign="top"><sub><strong>Response analysis:</strong> Here, Dr. PD has discovered that the connected source sent a non-compliant response.</sub></td>
    <td width="270" align="left" valign="top"><sub><strong>Message log filters</strong><br>Filter by message type, sender, receiver, SOP type, CRC, and flags.</sub></td>
    <td width="270" align="left" valign="top"><sub><strong>Capture trigger setup</strong><br>Trigger on protocol stages, message types, thresholds, or synchronized pulses.</sub></td>
  </tr>
</table>

## Project status

Dr. PD is currently undergoing device validation testing and will be available for crowdfunding soon through Crowd Supply. Visit our [prelaunch page](https://www.crowdsupply.com/t76-org/dr-pd) to sign up and receive updates on the project, including the crowdfunding launch.
