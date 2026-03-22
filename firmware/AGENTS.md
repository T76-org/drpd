# AGENTS.md

Starter guidance for contributors and AI agents working in this repo.

## Project overview

This project is a C++ implementation of a USB Power Delivery (USB-PD) controller for the Raspberry Pi Pico, utilizing the RP2350 processor. The codebase is organized into several modules, including PHY (physical layer), Logic (protocol handling), and SCPI (command parsing). The project aims to provide a robust and efficient implementation of USB-PD functionality, adhering to the USB-PD 3.2 specification.

## Coding style

  - Use camelCase for variable and function names. Use CamelCase for class names.
  - Use 4 spaces for indentation. Do not use tabs.
  - Place opening braces on the same line as the control statement or function declaration.
  - Limit lines to a maximum of 100 characters.
  - Use spaces around operators and after commas.

## Comments

  - Use `//` for single-line comments and `/* ... */` for multi-line comments.
  - Write comments in English and ensure they are clear and concise.
  - Use Doxygen-style comments for documenting classes and functions.
  - Ensure that all functions and classes have appropriate comments explaining their purpose and usage.
  - Every header file that declares a class must include a module-level file docblock (at the top of the file) that explains, in plain language, what the module/class is responsible for, how it fits in the architecture, and key behavior/developer expectations.
  - When adding a new feature or persistence mechanism, the file-level docblock must also explain the operational model, important safety/runtime constraints, and the maintenance workflow for extending it later.
  - For all class methods (public, protected, and private), Doxygen docblocks must include `@param` entries for every parameter and `@return` entries for non-`void` methods.
  - New methods added during a change must be documented in the same patch as the method declaration. Do not leave newly introduced methods, helpers, or persistence hooks undocumented.
  - Keep method docblocks synchronized with signatures; remove stale parameter descriptions when signatures change.
  - Avoid redundant comments that do not add value.
  - Add ///< comments for member variables to describe their purpose.
  - Before considering a change complete, review every newly added class member, method, and top-level constant in the touched headers and add docblocks or `///<` comments where applicable.

## File organization

  - Each class should be defined in its own header (.h/.hpp) and implementation (.cpp/.cxx) files.
  - Use include guards or `#pragma once` to prevent multiple inclusions of header files.
  - Group related classes and functions into namespaces to avoid name collisions. All code should be within the T76::DRPD parent namespace, plus a child namespace that reflects the module of the code (e.g.: `T76::DRPD::PHY`,`T76::DRPD::Logic`, etc.).
  - When adding a new C++ source file, ensure that it is properly referenced in the corresponding CMakeLists.txt file for compilation.

## Coding practices

  - Prefer `nullptr` over `NULL` or `0` for pointer initialization.
  - Use `override` and `final` keywords for virtual functions where appropriate.
  - Do not use private methods or variables unless necessary; prefer protected or public access when applicable.
  - Prefix protected and private member variables with an underscore (_).
  - Prefer smart pointers (`std::unique_ptr`, `std::shared_ptr`) over raw pointers for dynamic memory management.
  - Use `const` correctness to indicate immutability of variables and member functions.
  - Avoid using `using namespace std;` in header files. Instead, use fully qualified names or `using` declarations in implementation files.
  - Do not use exceptions for control flow. Use error codes or `std::optional`/`std::variant` where appropriate.
  - Write code that is appropriate for the Raspberry Pi Pico platform using the RP2350 processor. Take full advantage of the available hardware features and libraries provided by the platform.
  - Ensure proper resource management to avoid memory leaks and dangling pointers.
  - Use C++ 20 and C 11 standards features where applicable, while ensuring compatibility with the target platform.
  - When definining callbacks for anything other than timers in a class, you should:
    - Use `std::function` to define the callback type.
    - Provide setter and getter methods to allow users to set and retrieve the callback.
    - Ensure that the callback is invoked safely, checking if it is set before calling it.
  - When defining a timer callback, use best practices for the Raspberry Pi Pico SDK, including proper alarm ID management and ensuring that the callback function signature matches the expected type.
  - Core 1 execution context safety:
    - Treat core 1 as FreeRTOS-independent unless the design explicitly starts a core-1 scheduler.
    - Do not call `printf`/`stdio` from core 1 in normal runtime paths, because USB stdio can drive TinyUSB internals (`tud_task`) and indirectly execute USB interface code that expects core-0/FreeRTOS context.
    - Do not call FreeRTOS APIs from core 1 (tasks/queues/semaphores/event groups/delays) unless there is explicit, reviewed support for it.
    - For core-1-to-core-0 communication, prefer Pico SDK primitives (e.g., `queue_t`, multicore FIFO, spin locks) and hand work off to core 0 for FreeRTOS/USB interactions.
  - When creating getters and setters, use the following conventions:
    - Getters and setters should have the same name. For example, for a member variable `_value`, the getter and setter should be named `value()`.
    - The getter should be a `const` member function returning the value.
    - The setter should take a single parameter of the appropriate type and return `void`.
    - Avoid using decorators like `get` or `set` in the method names, or prefixing with `is` unless the member variable is a boolean.

## SCPI command handlers

  - SCPI command handler functions should have a consistent naming convention, starting with an underscore (_) followed by a descriptive name that indicates the command's purpose (e.g., `_queryDeviceStatus`).
  - Each SCPI command handler should accept a single parameter: a constant reference to a vector of `T76::SCPI::ParameterValue` objects.
  - Ensure that SCPI command handlers are properly documented with comments explaining their functionality and any important details about their implementation.
  - SCPI command handlers must not check for command validity or for the appropriate number or types of parameters; this is handled by the SCPI command parser before invoking the handler. However, they should check for any runtime conditions that may affect command execution, such as minimum/maximum value constraints or device state.
  - When dealing with enumerative values, SCPI handlers should use a string representation of the corresponding C++ enum types with the same case as defined in the enum. Conversion between strings and enum values should be handled using utility functions where necessary.

## Testing and validation

  - When making changes to the code, always double check for compilation problems in the entire project.

## USB-PD specific guidelines

  - Use the USB-PD 3.2 spec as the basis for all USB-PD related implementations.
  - Follow the USB Power Delivery Specification for message formatting, state machines, and protocol handling.
  - Validate all USB-PD messages and data structures to ensure compliance with the specification.

# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in `PLANS.md`) from design to implementation.
