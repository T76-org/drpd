# Automation examples

Install the library from the `python` directory with `python -m pip install .`.
Connect exactly one Dr. PD to the host and connect a PPS supply to its DUT
port. Disconnect any voltage-sensitive equipment before sweeping the supply.
Close other software controlling the instrument.

From the `python` directory:

```sh
python examples/pps_voltage_accuracy.py
```

The script sweeps every advertised PPS APDO from minimum to maximum in
100 mV steps (including the endpoint). Use `--step-mv 20` for every PPS
voltage setting. Each accepted setting settles for 0.5 seconds before five
VBUS readings spaced 0.1 seconds apart. Options `--settle`, `--samples`, and
`--current-ma` change these settings. The default requested current limit is
500 mA; this is a negotiated limit, not an electronic load setting.

The script prints a short progress update for each PPS profile and roughly
once every ten seconds during a sweep. On completion it reports the number
of settings tested, mean absolute voltage error, worst signed voltage error
and its setting, and maximum absolute percentage error. Errors compare the
mean measured voltage at each setting against the requested voltage.
No files are written. The sink is disabled and USB disconnected on normal
completion or an error.

This measures voltage at Dr. PD's input under the connected load. It includes
instrument measurement error and cable drop; it is not a USB-PD compliance
certification or an independent calibration of the supply. No load is
controlled by this script and no automatic pass/fail tolerance is assumed.
Use the supply's specified accuracy and the measurement uncertainty when
interpreting the results. Requires firmware supporting
`SINK:REQUEST:STATUS?`. Hardware operation has not yet been validated.

The PPS sweep temporarily disables EPR entry and restarts negotiation in
SPR mode. It restores the original EPR entry setting during cleanup.
