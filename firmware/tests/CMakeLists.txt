cmake_minimum_required(VERSION 3.20)
project(drpd_firmware_host_tests LANGUAGES CXX)

enable_testing()

function(add_drpd_header_test target source)
    add_executable(${target} ${source})
    target_compile_features(${target} PRIVATE cxx_std_20)
    target_compile_options(${target} PRIVATE -Wall -Wextra -Werror)
    add_test(NAME ${target} COMMAND ${target})
endfunction()

add_drpd_header_test(cable_inquiry_test cable_inquiry_test.cpp)
add_drpd_header_test(message_transport_state_test message_transport_state_test.cpp)
add_drpd_header_test(received_message_id_state_test received_message_id_state_test.cpp)

add_executable(inquiry_matcher_test
    inquiry_matcher_test.cpp
    ../lib/logic/sink/inquiry_descriptor.cpp)
target_compile_features(inquiry_matcher_test PRIVATE cxx_std_20)
target_compile_options(inquiry_matcher_test PRIVATE -Wall -Wextra -Werror)
target_compile_definitions(inquiry_matcher_test PRIVATE
    LOGIC_SINK_MAX_EXTENDED_PAYLOAD_BYTES=512
    LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US=33000)
add_test(NAME inquiry_matcher_test COMMAND inquiry_matcher_test)
