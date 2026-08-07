// JNI 桥：将 LibRaw 解码结果转为 Android Bitmap。
// 链接 libraw（见 CMakeLists.txt 与 docs/BUILD_LIBRAW.md）。
// 所有 JNI 入口用 extern "C" + try/catch 守护。原生 SIGSEGV 无法用 C++ 异常捕获，
// 因此本文件采用保守参数 + 严密越界校验，尽量避免野指针。
#include <jni.h>
#include <android/bitmap.h>
#include <android/log.h>
#include <string>
#include <vector>
#include <cstring>
#include <cstdlib>
#include <libraw/libraw.h>

#define LOG_TAG "RAWViewer"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)

using namespace std;

// spp: 3=RGB8, 4=RGBA8, 6=RGB16(每通道2字节小端), 8=RGBA16
// 统一转 ARGB_8888（dst 每像素 4 字节，内存序 B,G,R,A）
static void downsample_to_argb(
    const uint8_t *src, int sw, int sh, int spp,
    uint8_t *dst, int tw, int th, size_t dataSize) {

    const bool is16 = (spp == 6 || spp == 8);
    for (int y = 0; y < th; ++y) {
        long long syLL = ((long long)y * sh) / th;
        int sy = (syLL >= sh) ? sh - 1 : (int)syLL;
        const uint8_t *row = src + (size_t)sy * sw * spp;
        uint8_t *drow = dst + (size_t)y * tw * 4;
        // 校验行边界，防越界
        size_t rowByte = (size_t)sy * sw * spp;
        if (rowByte + (size_t)sw * spp > dataSize) break;
        for (int x = 0; x < tw; ++x) {
            long long sxLL = ((long long)x * sw) / tw;
            int sx = (sxLL >= sw) ? sw - 1 : (int)sxLL;
            const uint8_t *p = row + (size_t)sx * spp;
            uint8_t r, g, b, a = 0xFF;
            if (is16) {
                r = p[1]; g = p[3]; b = p[5];
                if (spp == 8) a = p[7];
            } else {
                r = p[0]; g = p[1]; b = p[2];
                if (spp == 4) a = p[3];
            }
            drow[(size_t)x * 4 + 0] = b;
            drow[(size_t)x * 4 + 1] = g;
            drow[(size_t)x * 4 + 2] = r;
            drow[(size_t)x * 4 + 3] = a;
        }
    }
}

// 原地 90/180/270 顺时针旋转 ARGB_8888（4 字节每像素）
static void rotate_argb(uint8_t *data, int &w, int &h, int rotation) {
    if (rotation == 180) {
        int n = w * h;
        for (int i = 0; i < n / 2; ++i) {
            for (int c = 0; c < 4; ++c) {
                uint8_t t = data[i * 4 + c];
                data[i * 4 + c] = data[(n - 1 - i) * 4 + c];
                data[(n - 1 - i) * 4 + c] = t;
            }
        }
        return;
    }
    if (rotation == 90 || rotation == 270) {
        size_t dstW = h, dstH = w;
        vector<uint8_t> out((size_t)dstH * dstW * 4);
        for (int y = 0; y < h; ++y) {
            for (int x = 0; x < w; ++x) {
                const uint8_t *p = data + ((size_t)y * w + x) * 4;
                int dx, dy;
                if (rotation == 90) { dx = h - 1 - y; dy = x; }
                else                 { dx = y;         dy = w - 1 - x; }
                uint8_t *q = out.data() + ((size_t)dy * dstW + dx) * 4;
                q[0] = p[0]; q[1] = p[1]; q[2] = p[2]; q[3] = p[3];
            }
        }
        memcpy(data, out.data(), out.size());
        int t = w; w = (int)dstW; h = (int)dstH;
    }
}

// 写一个 Bitmap 预分配的 ARGB_8888，返回 jobject 或 null
static jobject write_argb_bitmap(JNIEnv *env, uint8_t *argb, int w, int h) {
    try {
        jclass bmpCls = env->FindClass("android/graphics/Bitmap");
        if (!bmpCls) return nullptr;
        jmethodID create = env->GetStaticMethodID(bmpCls, "createBitmap",
            "(IILandroid/graphics/Bitmap$Config;)Landroid/graphics/Bitmap;");
        if (!create) return nullptr;
        jclass cfgCls = env->FindClass("android/graphics/Bitmap$Config");
        if (!cfgCls) return nullptr;
        jfieldID argb8888 = env->GetStaticFieldID(cfgCls, "ARGB_8888",
            "Landroid/graphics/Bitmap$Config;");
        if (!argb8888) return nullptr;
        jobject cfg = env->GetStaticObjectField(cfgCls, argb8888);
        jobject bitmap = env->CallStaticObjectMethod(bmpCls, create, w, h, cfg);
        if (!bitmap) return nullptr;

        void *pixels = nullptr;
        AndroidBitmapInfo info;
        if (AndroidBitmap_getInfo(env, bitmap, &info) != ANDROID_BITMAP_RESULT_SUCCESS) {
            env->DeleteLocalRef(bitmap); return nullptr;
        }
        if (AndroidBitmap_lockPixels(env, bitmap, &pixels) != ANDROID_BITMAP_RESULT_SUCCESS) {
            env->DeleteLocalRef(bitmap); return nullptr;
        }
        if (pixels) {
            uint8_t *dp = (uint8_t*)pixels;
            for (int y = 0; y < h; ++y) {
                memcpy(dp + (size_t)y * info.stride, argb + (size_t)y * w * 4, (size_t)w * 4);
            }
        }
        AndroidBitmap_unlockPixels(env, bitmap);
        return bitmap;
    } catch (...) {
        return nullptr;
    }
}

// ---------- 解码主入口 ----------
extern "C" JNIEXPORT jobject JNICALL
Java_com_example_rawviewer_nativebridge_LibRawBridge_decodeNative(
    JNIEnv *env, jobject thiz, jstring jPath, jint maxDim, jint rotation) {

    try {
        const char *cpath = env->GetStringUTFChars(jPath, nullptr);
        if (!cpath) return nullptr;
        string path(cpath);
        env->ReleaseStringUTFChars(jPath, cpath);

        LibRaw raw;
        // 关键：强制 8-bit 输出，避免默认 16-bit 导致 data 每像素 6/8 字节
        raw.imgdata.params.output_bps = 8;
        raw.imgdata.params.output_color = 1;   // sRGB
        raw.imgdata.params.user_qual = 2;       // bilinear（更快更省内存，适合缩略预览）
        // 关键：half_size=1 让 LibRaw 在 demosaic 时直接输出半分辨率。
        // 这对 A7C M2 全画幅 3300 万像素（7008x4672）至关重要：
        // 全尺寸 dcraw_process 峰值内存 ~300MB，低内存手机会 OOM 崩溃；
        // half_size 后只需 ~1/4，彻底规避崩溃。
        raw.imgdata.params.half_size = 1;
        raw.imgdata.params.no_auto_bright = 0;
        raw.imgdata.params.gamm[0] = 1.0;
        raw.imgdata.params.gamm[1] = 1.0;

        int rc = raw.open_file(path.c_str());
        if (rc != LIBRAW_SUCCESS) { LOGE("open_file failed rc=%d", rc); return nullptr; }
        LOGI("opened: %d x %d colors=%d", raw.imgdata.sizes.width,
             raw.imgdata.sizes.height, raw.imgdata.idata.colors);

        rc = raw.unpack();
        if (rc != LIBRAW_SUCCESS) { LOGE("unpack failed rc=%d", rc); raw.recycle(); return nullptr; }
        LOGI("unpack ok");

        rc = raw.dcraw_process();
        if (rc != LIBRAW_SUCCESS) { LOGE("dcraw_process failed rc=%d", rc); raw.recycle(); return nullptr; }
        LOGI("dcraw_process ok");

        libraw_processed_image_t *img = raw.dcraw_make_mem_image();
        raw.recycle();
        if (!img) { LOGE("dcraw_make_mem_image null"); return nullptr; }

        int w = img->width, h = img->height;
        if (w <= 0 || h <= 0 || img->data_size <= 0) {
            LOGE("bad dims w=%d h=%d size=%u", w, h, img->data_size);
            free(img->data); free(img); return nullptr;
        }

        // 确定每像素字节数：优先反推，并兼容 3/4/6/8
        int spp = 3;
        size_t perPix = img->data_size / ((size_t)w * h);
        if (perPix == 4) spp = 4;
        else if (perPix == 6) spp = 6;
        else if (perPix == 8) spp = 8;
        else spp = 3;
        LOGI("img: w=%d h=%d data_size=%u spp=%d colors=%d", w, h,
             img->data_size, spp, img->colors);

        // 目标尺寸：最长边限制（默认 1600，配合 half_size 后进一步压低内存与耗时）
        int cap = (maxDim > 0 && maxDim < 4096) ? maxDim : 1600;
        int tw = w, th = h;
        if (w >= h) { if (w > cap) { th = (int)((long long)h * cap / w); tw = cap; } }
        else        { if (h > cap) { tw = (int)((long long)w * cap / h); th = cap; } }
        if (tw < 1) tw = 1;
        if (th < 1) th = 1;

        size_t pix = (size_t)tw * th;
        vector<uint8_t> argb(pix * 4);
        downsample_to_argb(img->data, w, h, spp, argb.data(), tw, th, img->data_size);
        free(img->data);
        free(img);

        if (rotation != 0) rotate_argb(argb.data(), tw, th, (int)rotation);

        return write_argb_bitmap(env, argb.data(), tw, th);
    } catch (...) {
        LOGE("decodeNative C++ exception");
        return nullptr;
    }
}

// ---------- 缩略图 ----------
extern "C" JNIEXPORT jobject JNICALL
Java_com_example_rawviewer_nativebridge_LibRawBridge_extractThumbNative(
    JNIEnv *env, jobject thiz, jstring jPath) {

    try {
        const char *cpath = env->GetStringUTFChars(jPath, nullptr);
        if (!cpath) return nullptr;
        string path(cpath);
        env->ReleaseStringUTFChars(jPath, cpath);

        LibRaw raw;
        if (raw.open_file(path.c_str()) != LIBRAW_SUCCESS) return nullptr;
        if (raw.unpack_thumb() != LIBRAW_SUCCESS) { raw.recycle(); return nullptr; }
        libraw_processed_image_t *thumb = raw.dcraw_make_mem_thumb();
        raw.recycle();
        if (!thumb) return nullptr;

        jobject result = nullptr;
        if (thumb->type == LIBRAW_IMAGE_JPEG && thumb->data_size > 0) {
            jclass factory = env->FindClass("android/graphics/BitmapFactory");
            if (factory) {
                jmethodID decode = env->GetStaticMethodID(factory, "decodeByteArray",
                    "([BII)Landroid/graphics/Bitmap;");
                if (decode) {
                    jbyteArray arr = env->NewByteArray((jsize)thumb->data_size);
                    if (arr) {
                        env->SetByteArrayRegion(arr, 0, (jsize)thumb->data_size,
                            (const jbyte*)thumb->data);
                        result = env->CallStaticObjectMethod(factory, decode, arr, 0,
                            (jint)thumb->data_size);
                    }
                }
            }
        }
        free(thumb->data);
        free(thumb);
        return result;
    } catch (...) {
        return nullptr;
    }
}
