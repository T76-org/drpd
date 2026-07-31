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

Run the PPS Request encoding regression with:

```sh
clang++ -std=c++20 -Wall -Wextra -Werror \
  -Ifirmware/lib/proto/pd_messages \
  firmware/tests/pps_request_encoding_test.cpp \
  firmware/lib/proto/pd_messages/request.cpp \
  -o /tmp/drpd-pps-request-encoding-test
/tmp/drpd-pps-request-encoding-test
```

Run the Structured VDM and specification-revision regression with:

```sh
clang++ -std=c++20 -Wall -Wextra -Werror \
  -Ifirmware/lib/proto \
  -Ifirmware/lib/proto/pd_messages \
  firmware/tests/structured_vdm_test.cpp \
  firmware/lib/proto/pd_messages/structured_vdm.cpp \
  -o /tmp/drpd-structured-vdm-test
/tmp/drpd-structured-vdm-test
```

Run the Sink inquiry response matcher regression with:

```sh
clang++ -std=c++20 -Wall -Wextra -Werror \
  firmware/tests/inquiry_matcher_test.cpp \
  -o /tmp/drpd-inquiry-matcher-test
/tmp/drpd-inquiry-matcher-test
```
