# Generated Cmake Pico project file

cmake_minimum_required(VERSION 3.13)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Disable malloc/free overrides so that we can provide our own
set(SKIP_PICO_MALLOC 1)

# Initialise pico_sdk from installed location
# (note this can come from environment, CMake cache etc)

# == DO NOT EDIT THE FOLLOWING LINES for the Raspberry Pi Pico VS Code Extension to work ==
if(WIN32)
    set(USERHOME $ENV{USERPROFILE})
else()
    set(USERHOME $ENV{HOME})
endif()
set(sdkVersion 2.2.0)
set(toolchainVersion 14_2_Rel1)
set(picotoolVersion 2.2.0-a4)
set(picoVscode ${USERHOME}/.pico-sdk/cmake/pico-vscode.cmake)
if (EXISTS ${picoVscode})
    include(${picoVscode})
endif()
# ====================================================================================
set(PICO_BOARD pico2_w CACHE STRING "Board type")

# Pull in Raspberry Pi Pico SDK (must be before project)
include(pico_sdk_import.cmake)

# Pull in FreeRTOS Kernel (must be before project)
include(FreeRTOS_Kernel_import.cmake)

# Declare the project
project(drpd-firmware C CXX ASM)

# Initialise the Raspberry Pi Pico SDK
pico_sdk_init()

set(DRPD_FIRMWARE_VERSION "0.9.11")

set(DRPD_PERSISTENT_CONFIG_FLASH_SIZE 4096)
set(DRPD_STAGE3_BOOTLOADER_FLASH_SIZE 32768)
if(DEFINED PICO_FLASH_SIZE_BYTES)
    set(DRPD_FLASH_SIZE_BYTES ${PICO_FLASH_SIZE_BYTES})
else()
    set(DRPD_FLASH_SIZE_BYTES ${PICO_DEFAULT_FLASH_SIZE_BYTES})
endif()
# Reserve the final flash sector for PersistentConfig so the linked firmware
# image does not overwrite persisted settings during normal reflashing.
math(EXPR DRPD_APP_FLASH_OFFSET_BYTES "${DRPD_STAGE3_BOOTLOADER_FLASH_SIZE}")
math(EXPR DRPD_APP_LINK_FLASH_SIZE_BYTES "${DRPD_FLASH_SIZE_BYTES} - ${DRPD_STAGE3_BOOTLOADER_FLASH_SIZE} - ${DRPD_PERSISTENT_CONFIG_FLASH_SIZE}")
set(DRPD_APP_XIP_BASE "0x10008000")

file(READ "${PICO_SDK_PATH}/src/rp2_common/pico_crt0/rp2350/memmap_default.ld" DRPD_DEFAULT_MEMMAP)
string(REPLACE
    "INCLUDE \"pico_flash_region.ld\""
    "FLASH(rx) : ORIGIN = ${DRPD_APP_XIP_BASE}, LENGTH = ${DRPD_APP_LINK_FLASH_SIZE_BYTES}"
    DRPD_APP_MEMMAP
    "${DRPD_DEFAULT_MEMMAP}"
)
set(DRPD_APP_MEMMAP_FILE "${CMAKE_BINARY_DIR}/drpd_app_memmap.ld")
file(WRITE "${DRPD_APP_MEMMAP_FILE}" "${DRPD_APP_MEMMAP}")

configure_file(
    ${CMAKE_CURRENT_LIST_DIR}/config/version.hpp.in
    ${CMAKE_CURRENT_BINARY_DIR}/generated/drpd_version.hpp
    @ONLY
)

# USB Settings

set(T76_IC_USB_URL "t76.org/drpd" CACHE STRING "URL string for the USB WebUSB descriptor" FORCE)
set(T76_IC_USB_VENDOR_ID "0x2E8A" CACHE STRING "USB Vendor ID" FORCE)
set(T76_IC_USB_PRODUCT_ID "0x000A" CACHE STRING "USB Product ID" FORCE)
set(T76_IC_USB_MANUFACTURER_STRING "MTA Inc." CACHE STRING "USB Manufacturer String" FORCE)
set(T76_IC_USB_PRODUCT_STRING "Dr. PD" CACHE STRING "USB Product String" FORCE)

add_executable(drpd-firmware
        lib/app/app.cpp
        lib/app/app_scpi_analog_monitor.cpp
        lib/app/app_scpi_bus.cpp
        lib/app/app_scpi_device.cpp
        lib/app/app_scpi_sink.cpp
        lib/app/app_scpi_system.cpp
        lib/app/app_scpi_test.cpp
        lib/app/app_scpi_trigger.cpp
        lib/app/app_scpi_vbus.cpp
        lib/app/scpi_commands.cpp
        lib/logic/cc_bus_controller.cpp
        lib/logic/sink/message_sender.cpp
        lib/logic/sink/sink_alarm_service.cpp
        lib/logic/sink/sink.cpp
        lib/logic/sink/sink_context.cpp
        lib/logic/sink/sink_cc_messaging.cpp
        lib/logic/sink/sink_public_interface.cpp
        lib/logic/sink/sink_runtime_state.cpp
        lib/logic/sink/state_handlers/disconnected.cpp
        lib/logic/sink/state_handlers/epr_keepalive.cpp
        lib/logic/sink/state_handlers/epr_mode_entry.cpp
        lib/logic/sink/state_handlers/select_capability.cpp
        lib/logic/sink/state_handlers/ready.cpp
        lib/logic/sink/state_handlers/transition_sink.cpp
        lib/logic/sink/state_handlers/wait_for_capabilities.cpp
        lib/logic/trigger_controller.cpp
        lib/phy/4b5b.cpp
        lib/phy/analog_monitor.cpp
        lib/phy/bitpacker.cpp
        lib/phy/bmc_decoded_message.cpp
        lib/phy/bmc_decoder.cpp
        lib/phy/bmc_encoded_message.cpp
        lib/phy/bmc_encoder.cpp
        lib/phy/cc_bus_manager.cpp
        lib/phy/cc_role_manager.cpp
        lib/phy/sync_manager.cpp
        lib/phy/vbus_manager.cpp
        lib/proto/pd_extended_header.cpp
        lib/proto/pd_header.cpp
        lib/proto/pd_message_types.cpp
        lib/proto/pd_sop.cpp
        lib/proto/pd_messages/control.cpp
        lib/proto/pd_messages/epr_mode.cpp
        lib/proto/pd_messages/epr_source_capabilities.cpp
        lib/proto/pd_messages/pdo/pdo.cpp
        lib/proto/pd_messages/pdo/pdo_fixed.cpp
        lib/proto/pd_messages/pdo/pdo_variable.cpp
        lib/proto/pd_messages/pdo/pdo_battery.cpp
        lib/proto/pd_messages/pdo/pdo_augmented.cpp
        lib/proto/pd_messages/request.cpp
        lib/proto/pd_messages/source_capabilities.cpp
        lib/util/persistent_config.cpp
        main.cpp
        freertos/rp2350.c
)

pico_set_linker_script(drpd-firmware ${DRPD_APP_MEMMAP_FILE})

pico_generate_pio_header(drpd-firmware ${CMAKE_CURRENT_LIST_DIR}/lib/phy/bmc_decoder.pio)
pico_generate_pio_header(drpd-firmware ${CMAKE_CURRENT_LIST_DIR}/lib/phy/bmc_encoder\.pio)

add_compile_definitions(
    PLL_SYS_VCO_FREQ_HZ=1200000000
    PLL_SYS_POSTDIV1=6
    PLL_SYS_POSTDIV2=1
    SYS_CLK_MHZ=200
    PICO_CXX_DISABLE_ALLOCATION_OVERRIDES=1 # Disable new/delete overrides so that we can provide our own.
    LIB_TINYUSB_DEVICE=1
    T76_USE_GLOBAL_LOCKS=1
)

set(T76_SCPI_CONFIGURATION_FILE ${CMAKE_CURRENT_SOURCE_DIR}/lib/app/scpi.yaml)
set(T76_SCPI_OUTPUT_FILE ${CMAKE_CURRENT_SOURCE_DIR}/lib/app/scpi_commands.cpp)

set(FREERTOS_CONFIG_DIR ${CMAKE_CURRENT_LIST_DIR}/freertos)

pico_set_program_name(drpd-firmware "Dr.PD")
pico_set_program_version(drpd-firmware "${DRPD_FIRMWARE_VERSION}")

# Modify the below lines to enable/disable output over UART/USB
pico_enable_stdio_usb(drpd-firmware 1)
pico_enable_stdio_uart(drpd-firmware 0)

include(config/app.cmake)
include(config/pins.cmake)
include(config/logic/cc_bus_controller.cmake)
include(config/logic/sink.cmake)
include(config/logic/trigger_controller.cmake)
include(config/phy/analog_monitor.cmake)
include(config/phy/bmc_decoder.cmake)
include(config/phy/bmc_encoder.cmake)
include(config/phy/cc_bus_manager.cmake)
include(config/phy/cc_role_manager.cmake)
include(config/phy/sync_manager.cmake)
include(config/phy/vbus_manager.cmake)

add_subdirectory(t76)

# Suppress deprecated volatile warnings from FreeRTOS (C++ only)
target_compile_options(drpd-firmware PUBLIC $<$<COMPILE_LANGUAGE:CXX>:-Wno-volatile>)
target_compile_options(t76_ic PUBLIC $<$<COMPILE_LANGUAGE:CXX>:-Wno-volatile>)

target_compile_definitions(drpd-firmware PUBLIC
    DRPD_ENABLE_TEST_SCPI_COMMANDS              # Enable TEST:*** SCPI commands.
    T76_UPDATER_APPLICATION_FLASH_OFFSET_BYTES=${DRPD_APP_FLASH_OFFSET_BYTES}
)

# Add the standard library to the build
target_link_libraries(drpd-firmware
        hardware_adc
        hardware_dma
        hardware_flash
        hardware_pio
        hardware_pwm
        hardware_sync
        t76_ic
        t76_ic_updater
)

t76_add_stage3_updater_bootloader(drpd-stage3-bootloader
    APPLICATION_FLASH_OFFSET ${DRPD_APP_FLASH_OFFSET_BYTES}
    FLASH_SIZE ${DRPD_FLASH_SIZE_BYTES}
    PROTECTED_TAIL_SIZE ${DRPD_PERSISTENT_CONFIG_FLASH_SIZE}
    USB_VENDOR_ID ${T76_IC_USB_VENDOR_ID}
    USB_PRODUCT_ID ${T76_IC_USB_PRODUCT_ID}
    USB_MANUFACTURER_STRING "${T76_IC_USB_MANUFACTURER_STRING}"
    USB_PRODUCT_STRING "${T76_IC_USB_PRODUCT_STRING}"
    PROGRAM_NAME "Dr.PD Updater"
    PROGRAM_VERSION "${DRPD_FIRMWARE_VERSION}"
)

add_dependencies(drpd-firmware
        GenerateSCPICommands
)

# Add the standard include files to the build
target_include_directories(drpd-firmware PRIVATE
        ${CMAKE_CURRENT_LIST_DIR}
        ${CMAKE_CURRENT_LIST_DIR}/freertos
        ${CMAKE_CURRENT_BINARY_DIR}/generated
)

set(DRPD_PICOTOOL "${USERHOME}/.pico-sdk/picotool/${picotoolVersion}/picotool/picotool")

add_custom_command(
    OUTPUT
        ${CMAKE_CURRENT_BINARY_DIR}/drpd-firmware.bin
        ${CMAKE_CURRENT_BINARY_DIR}/drpd-firmware.uf2
    COMMAND ${CMAKE_OBJCOPY}
        -Obinary
        $<TARGET_FILE:drpd-firmware>
        ${CMAKE_CURRENT_BINARY_DIR}/drpd-firmware.bin
    COMMAND ${DRPD_PICOTOOL}
        uf2 convert
        --quiet
        ${CMAKE_CURRENT_BINARY_DIR}/drpd-firmware.bin
        -t bin
        ${CMAKE_CURRENT_BINARY_DIR}/drpd-firmware.uf2
        -t uf2
        --offset ${DRPD_APP_XIP_BASE}
        --family rp2350-arm-s
        --abs-block
    DEPENDS drpd-firmware
    COMMENT "Generating relocated DRPD application BIN and UF2"
)

add_custom_target(drpd-firmware-application ALL
    DEPENDS
        ${CMAKE_CURRENT_BINARY_DIR}/drpd-firmware.bin
        ${CMAKE_CURRENT_BINARY_DIR}/drpd-firmware.uf2
)

t76_add_combined_uf2(drpd-firmware-combined
    OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/drpd-firmware-combined.uf2
    BOOTLOADER_UF2 ${CMAKE_CURRENT_BINARY_DIR}/drpd-stage3-bootloader.uf2
    APP_UF2 ${CMAKE_CURRENT_BINARY_DIR}/drpd-firmware.uf2
)
add_dependencies(drpd-firmware-combined drpd-stage3-bootloader drpd-firmware-application)
