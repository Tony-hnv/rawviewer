# LibRaw 原生库编译（选项 A1）。
# 需要 LibRaw 源码位于 <工程根>/app/libraw/（workflow 会自动 clone）。
cmake_minimum_required(VERSION 3.22.1)
project(rawviewer)

# LibRaw 源码根（Android CMake 中 CMAKE_SOURCE_DIR = app/src/main/cpp）
set(LIBRAW_ROOT "${CMAKE_SOURCE_DIR}/../../libraw" CACHE PATH "LibRaw source root")

if(NOT EXISTS "${LIBRAW_ROOT}/src/libraw.cpp")
    message(FATAL_ERROR "LibRaw source not found at ${LIBRAW_ROOT}. "
        "Run: git clone --depth 1 https://github.com/LibRaw/LibRaw.git app/libraw")
endif()

add_library(rawlite SHARED raw_bridge.cpp)

# LibRaw 实际源码结构：src/ 下平铺所有 .cpp
file(GLOB LIBRAW_SRC "${LIBRAW_ROOT}/src/*.cpp")
list(REMOVE_ITEM LIBRAW_SRC
    "${LIBRAW_ROOT}/src/dcraw_common.cpp"
    "${LIBRAW_ROOT}/src/dcraw_crt.cpp"
)

target_sources(rawlite PRIVATE ${LIBRAW_SRC})
target_include_directories(rawlite PRIVATE
    "${LIBRAW_ROOT}"
    "${LIBRAW_ROOT}/src"
    "${LIBRAW_ROOT}/libraw"
    "${LIBRAW_ROOT}/internal"
    "${LIBRAW_ROOT}/include"
)
target_compile_definitions(rawlite PRIVATE
    LIBRAW_NODLL
    LIBRAW_NO_JPEG
)
target_compile_options(rawlite PRIVATE -O2 -fexceptions -frtti)
target_link_libraries(rawlite
    android
    log
    jnigraphics
)
