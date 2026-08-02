# Firmware Host Tests

All CMake-integrated host regressions run with:

```sh
cmake -S firmware/tests -B /tmp/drpd-firmware-host-tests
cmake --build /tmp/drpd-firmware-host-tests
ctest --test-dir /tmp/drpd-firmware-host-tests --output-on-failure
```

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
  firmware/lib/logic/sink/inquiry_descriptor.cpp \
  -DLOGIC_SINK_MAX_EXTENDED_PAYLOAD_BYTES=512 \
  -DLOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US=33000 \
  -o /tmp/drpd-inquiry-matcher-test
/tmp/drpd-inquiry-matcher-test
```

Run active extended inquiry reassembly bounds/order/duplicate regression with:

```sh
clang++ -std=c++20 -Wall -Wextra -Werror \
  firmware/tests/inquiry_reassembly_test.cpp \
  -o /tmp/drpd-inquiry-reassembly-test
/tmp/drpd-inquiry-reassembly-test
```

Run trailing optional SCPI parameter arity regression with:

```sh
clang++ -std=c++20 -Wall -Wextra -Werror -I firmware/t76/scpi \
  firmware/tests/scpi_optional_parameters_test.cpp \
  firmware/t76/scpi/trie.cpp \
  -o /tmp/drpd-scpi-optional-test
/tmp/drpd-scpi-optional-test
```

Run independent SOP transport bookkeeping regressions with:

```sh
clang++ -std=c++20 -Wall -Wextra -Werror \
  firmware/tests/message_transport_state_test.cpp \
  -o /tmp/drpd-message-transport-test
/tmp/drpd-message-transport-test

clang++ -std=c++20 -Wall -Wextra -Werror \
  firmware/tests/received_message_id_state_test.cpp \
  -o /tmp/drpd-received-message-id-test
/tmp/drpd-received-message-id-test

clang++ -std=c++20 -Wall -Wextra -Werror \
  firmware/tests/cable_inquiry_test.cpp \
  -o /tmp/drpd-cable-inquiry-test
/tmp/drpd-cable-inquiry-test
```
