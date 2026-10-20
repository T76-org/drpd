# Hardware revision R2608-A

R2608-A retains the circuit topology documented for R2605-A. The published snapshot comes from the R2608-A KiCad project.

## Changes from R2605-A

| R2605-A reference | R2608-A reference | Value change |
| --- | --- | --- |
| R14 | R512 | 100 Ω → 10 Ω |
| R16 | R507 | Unchanged: 10 Ω |
| R504 | R504 | 100 Ω → 10 Ω |
| R505 | R505 | 1 kΩ → 2 kΩ |

These resistors belong to the BMC transmitter. The current-mirror and transmit-enable operating principles remain applicable. Exported schematic netlists have matching component-pin connectivity after the two reference changes and electrically equivalent resistor pin swaps. This comparison does not establish waveform performance or hardware qualification.

GPIO24 retains the R2605-A hardware-identification strap, so firmware identifies this board as the R2605-A-compatible hardware family.

## Design files

- [Schematic PDF](./pdf/Dr.%20PD%20R2608-A.pdf)
- [KiCad root schematic](./kicad-schematics/Dr.PD.kicad_sch) (download all six schematic files together)
- [Interactive bill of materials and PCB placement](./virtual-bom/bom.html)

The documentation site defaults to R2608-A; R2605-A remains available in the hardware viewers for historical references.
