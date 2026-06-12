# Hardware revision R2605-A

Revision 2605-A is the first PVT revision of the Dr. PD hardware. It is based largely on R2603-A, with some important changes:

- The host port is now USB-C, rather than microUSB.
- The OVC/OCP circuit is bidirectional
- The banana connectors now include reverse-polarity protection
- There is a new slew control circuit for the BMC encoder outputs, which should better conform to the USB-PD standard and reduce EMI.

You can use the [virtual BOM](./virtual-bom/bom.html) to see the components used in this revision and how they are placed on the board.

The schematic is available in [PDF format](./pdf/Dr.PD.pdf) and in [KiCad format](./kicad/DrPD.kicad_sch), which can be viewed using [KiCanvas](https://kicanvas.org/?repo=https%3A%2F%2Fgithub.com%2FT76-org%2Fdrpd%2Ftree%2Fmain%2Fhardware%2FR2605-A%2Fkicad-schematics).