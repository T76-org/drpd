# PDO library CMakeLists.txt

set(LIBRARY_NAME drpd_pdo)

add_library(${LIBRARY_NAME} STATIC
    pdo.cpp
    pdo_fixed.cpp
    pdo_variable.cpp
    pdo_battery.cpp
    pdo_augmented.cpp
)

# Public include directories (headers that consumers of this library need)
target_include_directories(${LIBRARY_NAME} PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/..
)

# Link required libraries
target_link_libraries(${LIBRARY_NAME} PUBLIC
    pico_stdlib
)
