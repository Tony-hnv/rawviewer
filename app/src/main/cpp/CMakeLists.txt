# LibRaw 原生库编译（选项 A1）。
# 需要 LibRaw 源码位于 <工程根>/app/libraw/（workflow 会自动 clone）。
cmake_minimum_required(VERSION 3.22.1)
project(rawviewer)

# 使用 c++_shared STL（LibRaw 需要 C++ 标准库）
set(CMAKE_ANDROID_STL c++_shared)

# LibRaw 源码根：尝试多个候选路径（适配不同 workdir/checkout 行为）
set(CANDIDATE_ROOTS
    "${CMAKE_CURRENT_SOURCE_DIR}/../../libraw"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../libraw"
    "${CMAKE_SOURCE_DIR}/../../libraw"
    "${CMAKE_SOURCE_DIR}/libraw"
    "${CMAKE_HOME_DIRECTORY}/../libraw"
)
set(LIBRAW_ROOT "")
foreach(root IN LISTS CANDIDATE_ROOTS)
    if(EXISTS "${root}/libraw/libraw.h" OR EXISTS "${root}/src/libraw_datastream.cpp")
        set(LIBRAW_ROOT "${root}")
        break()
    endif()
endforeach()
if(NOT LIBRAW_ROOT)
    message(FATAL_ERROR "LibRaw source not found. Tried: ${CANDIDATE_ROOTS}. "
        "Run: git clone --depth 1 https://github.com/LibRaw/LibRaw.git app/libraw")
endif()
message(STATUS "Using LibRaw at: ${LIBRAW_ROOT}")

# LibRaw 需要 dng sdk（内嵌在 LibRaw 源码树里）
set(LIBRAW_DNG "${LIBRAW_ROOT}/internal/dngsdk")
if(EXISTS "${LIBRAW_DNG}")
    message(STATUS "DNG SDK found at ${LIBRAW_DNG}")
else()
    message(STATUS "NOTE: DNG SDK not found at ${LIBRAW_DNG}; dng-related code may fail")
endif()

add_library(rawlite SHARED raw_bridge.cpp)

# 递归收集 LibRaw 源码（.cpp + .c），排除不需要的示例/测试
file(GLOB_RECURSE LIBRAW_CPP
    "${LIBRAW_ROOT}/src/*.cpp"
    "${LIBRAW_ROOT}/src/*.c"
    "${LIBRAW_ROOT}/src/decoders/*.cpp"
    "${LIBRAW_ROOT}/src/decoders/*.c"
    "${LIBRAW_ROOT}/src/decompressors/*.cpp"
    "${LIBRAW_ROOT}/src/decompressors/*.c"
    "${LIBRAW_ROOT}/src/demosaic/*.cpp"
    "${LIBRAW_ROOT}/src/demosaic/*.c"
    "${LIBRAW_ROOT}/src/integration/*.cpp"
    "${LIBRAW_ROOT}/src/metadata/*.cpp"
    "${LIBRAW_ROOT}/src/metadata/*.c"
    "${LIBRAW_ROOT}/src/postprocessing/*.cpp"
    "${LIBRAW_ROOT}/src/postprocessing/*.c"
    "${LIBRAW_ROOT}/src/preprocessing/*.cpp"
    "${LIBRAW_ROOT}/src/preprocessing/*.c"
    "${LIBRAW_ROOT}/src/utils/*.cpp"
    "${LIBRAW_ROOT}/src/utils/*.c"
    "${LIBRAW_ROOT}/src/tables/*.cpp"
    "${LIBRAW_ROOT}/src/tables/*.c"
)
list(REMOVE_ITEM LIBRAW_CPP
    "${LIBRAW_ROOT}/src/dcraw_common.cpp"
    "${LIBRAW_ROOT}/src/dcraw_crt.cpp"
)
list(REMOVE_DUPLICATES LIBRAW_CPP)

if(NOT LIBRAW_CPP)
    message(FATAL_ERROR "No LibRaw source files found under ${LIBRAW_ROOT}/src")
endif()

target_sources(rawlite PRIVATE ${LIBRAW_CPP})
target_include_directories(rawlite PRIVATE
    "${LIBRAW_ROOT}"
    "${LIBRAW_ROOT}/src"
    "${LIBRAW_ROOT}/libraw"
    "${LIBRAW_ROOT}/internal"
    "${LIBRAW_ROOT}/internal/dngsdk"
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
