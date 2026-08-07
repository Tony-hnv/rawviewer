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

# ---- LibRaw 官方源文件清单（摘自 LibRaw 的 Makefile.am: lib_libraw_a_SOURCES）----
# 注意：不要用 file(GLOB ...) 盲扫全部 .cpp，否则会把互斥的 *_ph.cpp / *_dcraw.cpp
# 同时编译进来导致 duplicate symbol。这里显式列出官方构建使用的文件。
set(LIBRAW_OFFICIAL_SRC
    "src/libraw_c_api.cpp"
    "src/libraw_datastream.cpp"
    "src/decoders/canon_600.cpp"
    "src/decoders/crx.cpp"
    "src/decoders/pana8.cpp"
    "src/decoders/decoders_dcraw.cpp"
    "src/decoders/sonycc.cpp"
    "src/decoders/sony_arw6.cpp"
    "src/decompressors/losslessjpeg.cpp"
    "src/decoders/decoders_libraw_dcrdefs.cpp"
    "src/decoders/olympus14.cpp"
    "src/decoders/decoders_libraw.cpp"
    "src/decoders/dng.cpp"
    "src/decoders/fp_dng.cpp"
    "src/decoders/fuji_compressed.cpp"
    "src/decoders/generic.cpp"
    "src/decoders/kodak_decoders.cpp"
    "src/decoders/load_mfbacks.cpp"
    "src/decoders/smal.cpp"
    "src/decoders/unpack_thumb.cpp"
    "src/decoders/unpack.cpp"
    "src/demosaic/aahd_demosaic.cpp"
    "src/demosaic/ahd_demosaic.cpp"
    "src/demosaic/dcb_demosaic.cpp"
    "src/demosaic/dht_demosaic.cpp"
    "src/demosaic/misc_demosaic.cpp"
    "src/demosaic/xtrans_demosaic.cpp"
    "src/integration/dngsdk_glue.cpp"
    "src/integration/rawspeed_glue.cpp"
    "src/metadata/adobepano.cpp"
    "src/metadata/canon.cpp"
    "src/metadata/ciff.cpp"
    "src/metadata/cr3_parser.cpp"
    "src/metadata/epson.cpp"
    "src/metadata/exif_gps.cpp"
    "src/metadata/fuji.cpp"
    "src/metadata/identify_tools.cpp"
    "src/metadata/identify.cpp"
    "src/metadata/kodak.cpp"
    "src/metadata/leica.cpp"
    "src/metadata/makernotes.cpp"
    "src/metadata/mediumformat.cpp"
    "src/metadata/minolta.cpp"
    "src/metadata/misc_parsers.cpp"
    "src/metadata/nikon.cpp"
    "src/metadata/normalize_model.cpp"
    "src/metadata/olympus.cpp"
    "src/metadata/hasselblad_model.cpp"
    "src/metadata/p1.cpp"
    "src/metadata/pentax.cpp"
    "src/metadata/samsung.cpp"
    "src/metadata/sony.cpp"
    "src/metadata/tiff.cpp"
    "src/postprocessing/aspect_ratio.cpp"
    "src/postprocessing/dcraw_process.cpp"
    "src/postprocessing/mem_image.cpp"
    "src/postprocessing/postprocessing_aux.cpp"
    "src/postprocessing/postprocessing_utils_dcrdefs.cpp"
    "src/postprocessing/postprocessing_utils.cpp"
    "src/preprocessing/ext_preprocess.cpp"
    "src/preprocessing/raw2image.cpp"
    "src/preprocessing/subtract_black.cpp"
    "src/tables/cameralist.cpp"
    "src/tables/colorconst.cpp"
    "src/tables/colordata.cpp"
    "src/tables/wblists.cpp"
    "src/utils/curves.cpp"
    "src/utils/decoder_info.cpp"
    "src/utils/init_close_utils.cpp"
    "src/utils/open.cpp"
    "src/utils/phaseone_processing.cpp"
    "src/utils/read_utils.cpp"
    "src/utils/thumb_utils.cpp"
    "src/utils/utils_dcraw.cpp"
    "src/utils/utils_libraw.cpp"
    "src/write/apply_profile.cpp"
    "src/write/file_write.cpp"
    "src/write/tiff_writer.cpp"
    "src/x3f/x3f_parse_process.cpp"
    "src/x3f/x3f_utils_patched.cpp"
)

# 构建绝对路径清单，并过滤不存在的（保持稳健）
set(LIBRAW_SRC "")
foreach(rel IN LISTS LIBRAW_OFFICIAL_SRC)
    if(EXISTS "${LIBRAW_ROOT}/${rel}")
        list(APPEND LIBRAW_SRC "${LIBRAW_ROOT}/${rel}")
    else()
        message(STATUS "SKIP (missing): ${rel}")
    endif()
endforeach()

if(NOT LIBRAW_SRC)
    message(FATAL_ERROR "No LibRaw source files resolved under ${LIBRAW_ROOT}")
endif()
message(STATUS "Compiling ${LIBRAW_SRC}")

add_library(rawlite SHARED raw_bridge.cpp ${LIBRAW_SRC})
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
target_link_libraries(rawlite android log jnigraphics)
