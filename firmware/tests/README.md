# Firmware Host Tests

These tests exercise firmware logic that can be built without the Pico SDK or
hardware target.

Run the Source_Capabilities decoder regression with:

```sh
clang++ -std=c++20 -Wall -Wextra -Werror \
  -Ifirmware/lib/proto/pd_messages \
  firmware/tests/source_capabilities_decoder_test.cpp \
  firmware/lib/proto/pd_messages/source_capabilities.cpp \
  firmware/lib/proto/pd_messages/pdo/pdo.cpp \
  firmware/lib/proto/pd_messages/pdo/pdo_fixed.cpp \
  firmware/lib/proto/pd_messages/pdo/pdo_variable.cpp \
  firmware/lib/proto/pd_messages/pdo/pdo_battery.cpp \
  firmware/lib/proto/pd_messages/pdo/pdo_augmented.cpp \
  -o /tmp/drpd-source-capabilities-decoder-test
/tmp/drpd-source-capabilities-decoder-test
```

Run the calibrated VBUS zero-clamping regression with:

```sh
clang++ -std=c++20 -Wall -Wextra -Werror \
  -Ifirmware/lib/phy \
  firmware/tests/vbus_voltage_filter_test.cpp \
  -o /tmp/drpd-vbus-voltage-filter-test
/tmp/drpd-vbus-voltage-filter-test
```
