// JNI 桥：将 LibRaw 解码结果转为 Android Bitmap。
// 链接 libraw（见 CMakeLists.txt 与 docs/BUILD_LIBRAW.md）。
// 所有 JNI 入口用 extern "C" + try/catch 守护，任何异常返回 null 而非崩溃。
#include <jni.h>
#include <android/bitmap.h>
#include <string>
#include <vector>
#include <cstring>
#include <cstdlib>
#include <libraw/libraw.h>

using namespace std;

// ---------- 像素拷贝辅助 ----------
// 把 libraw RGB(A) 数据采样缩放到 (tw,th)，写入 ARGB_8888 像素缓冲 dst（RGBA 每像素 4 字节，小端 = B,G,R,A）
static void downsample_rgb_to_argb(
    const uint8_t *src, int sw, int sh, int spp,
    uint8_t *dst, int tw, int th) {

    // spp: 源每像素字节数（3=RGB，4=RGBA）
    for (int y = 0; y < th; ++y) {
        int sy = (int)(((long long)y * sh) / th);
        if (sy >= sh) sy = sh - 1;
        const uint8_t *row = src + (size_t)sy * sw * spp;
        uint8_t *drow = dst + (size_t)y * tw * 4;
        for (int x = 0; x < tw; ++x) {
            int sx = (int)(((long long)x * sw) / tw);
            if (sx >= sw) sx = sw - 1;
            const uint8_t *p = row + (size_t)sx * spp;
            uint8_t r = p[0], g = p[1], b = p[2], a = 0xFF;
            if (spp >= 4) a = p[3];
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
        int rc;
        rc = raw.open_file(path.c_str());
        if (rc != LIBRAW_SUCCESS) return nullptr;
        rc = raw.unpack();
        if (rc != LIBRAW_SUCCESS) { raw.recycle(); return nullptr; }
        rc = raw.dcraw_process();
        if (rc != LIBRAW_SUCCESS) { raw.recycle(); return nullptr; }

        libraw_processed_image_t *img = raw.dcraw_make_mem_image();
        raw.recycle();
        if (!img) return nullptr;

        int w = img->width, h = img->height;
        // 每像素字节数：优先根据 data_size 反推，兜底看 colors
        // （某些配置下 colors 标记可能与实际输出布局不一致，反推更稳）
        int spp = 3;
        if (w > 0 && h > 0 && img->data_size > 0) {
            int per = (int)(img->data_size / ((size_t)w * h));
            if (per == 4 || per == 3) spp = per;
            else if (img->colors == 3) spp = 3; else spp = 4;
        } else if (img->colors == 3) {
            spp = 3;
        } else {
            spp = 4;
        }
        if (w <= 0 || h <= 0 || img->data_size <= 0) {
            free(img->data); free(img); return nullptr;
        }

        // 目标尺寸：最长边限制，默认上限更保守，避免超大内存
        int cap = (maxDim > 0 && maxDim < 4096) ? maxDim : 2048;
        int tw = w, th = h;
        if (w >= h) { if (w > cap) { th = (int)((long long)h * cap / w); tw = cap; } }
        else        { if (h > cap) { tw = (int)((long long)w * cap / h); th = cap; } }
        if (tw < 1) tw = 1;
        if (th < 1) th = 1;

        // 输出缓冲（ARGB_8888）
        size_t pix = (size_t)tw * th;
        vector<uint8_t> argb(pix * 4);
        downsample_rgb_to_argb(img->data, w, h, spp, argb.data(), tw, th);
        free(img->data);
        free(img);

        // 旋转
        if (rotation != 0) rotate_argb(argb.data(), tw, th, (int)rotation);

        // 用 AndroidBitmap API 直接创建 ARGB_8888 Bitmap 并拷入像素
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
        jobject bitmap = env->CallStaticObjectMethod(bmpCls, create, tw, th, cfg);
        if (!bitmap) return nullptr;

        // 锁定像素写入
        void *pixels = nullptr;
        AndroidBitmapInfo info;
        if (AndroidBitmap_getInfo(env, bitmap, &info) != ANDROID_BITMAP_RESULT_SUCCESS) {
            env->DeleteLocalRef(bitmap); return nullptr;
        }
        if (AndroidBitmap_lockPixels(env, bitmap, &pixels) != ANDROID_BITMAP_RESULT_SUCCESS) {
            env->DeleteLocalRef(bitmap); return nullptr;
        }
        if (pixels) {
            // info.stride 可能 != width*4，逐行拷贝
            uint8_t *dp = (uint8_t*)pixels;
            for (int y = 0; y < th; ++y) {
                memcpy(dp + (size_t)y * info.stride,
                       argb.data() + (size_t)y * tw * 4, (size_t)tw * 4);
            }
        }
        AndroidBitmap_unlockPixels(env, bitmap);
        return bitmap;
    } catch (...) {
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
