// JNI 桥：将 LibRaw 解码结果转为 Android Bitmap。
// 需要链接 libraw（见 CMakeLists.txt 与 docs/BUILD_LIBRAW.md）。
#include <jni.h>
#include <android/bitmap.h>
#include <string>
#include <libraw/libraw.h>

using namespace std;

static void rotate_90_clockwise(uint8_t *data, int &w, int &h, int bpp) {
    // bpp: 每像素字节数 (3=RGB888, 4=RGBA8888)
    int srcW = w, srcH = h;
    int dstW = srcH, dstH = srcW;
    int stride = dstW * bpp;
    std::vector<uint8_t> out((size_t)dstH * stride);
    for (int y = 0; y < srcH; ++y) {
        for (int x = 0; x < srcW; ++x) {
            int srcIdx = (y * srcW + x) * bpp;
            int dstX = dstW - 1 - y;
            int dstY = x;
            int dstIdx = (dstY * dstW + dstX) * bpp;
            for (int c = 0; c < bpp; ++c) {
                out[dstIdx + c] = data[srcIdx + c];
            }
        }
    }
    data = (uint8_t*)realloc(data, (size_t)dstH * stride);
    memcpy(data, out.data(), (size_t)dstH * stride);
    w = dstW; h = dstH;
}

static jintArray copy_to_android(JNIEnv *env, const vector<uint32_t> &argb, int w, int h) {
    jintArray arr = env->NewIntArray((jsize)(argb.size()));
    if (!arr) return nullptr;
    env->SetIntArrayRegion(arr, 0, (jsize)argb.size(), (const jint*)argb.data());
    return arr;
}

extern "C" JNIEXPORT jobject JNICALL
Java_com_example_rawviewer_nativebridge_LibRawBridge_decodeNative(
    JNIEnv *env, jobject thiz, jstring jPath, jint maxDim, jint rotation) {

    const char *cpath = env->GetStringUTFChars(jPath, nullptr);
    string path(cpath);
    env->ReleaseStringUTFChars(jPath, cpath);

    LibRaw raw;
    if (raw.open_file(path.c_str()) != LIBRAW_SUCCESS) return nullptr;
    if (raw.unpack() != LIBRAW_SUCCESS) { raw.recycle(); return nullptr; }
    if (raw.dcraw_process() != LIBRAW_SUCCESS) { raw.recycle(); return nullptr; }

    libraw_processed_image_t *img = raw.dcraw_make_mem_image();
    raw.recycle();
    if (!img) return nullptr;

    int w = img->width, h = img->height;
    int bpp = (img->colors == 3) ? 3 : 4;

    // 缩小采样（简单最近邻缩放到最长边 maxDim）
    int tw = w, th = h;
    if (maxDim > 0) {
        float scale = 1.0f;
        if (w >= h) { if (w > maxDim) scale = (float)maxDim / w; }
        else        { if (h > maxDim) scale = (float)maxDim / h; }
        tw = (int)(w * scale); th = (int)(h * scale);
        if (tw < 1) tw = 1;
        if (th < 1) th = 1;
    }

    // 转为 ARGB int 数组（AS 从 int 构造 Bitmap）
    size_t n = (size_t)tw * th;
    vector<uint32_t> argb(n);
    uint8_t *src = img->data;
    for (int y = 0; y < th; ++y) {
        int sy = (int)(((float)y / th) * h);
        if (sy >= h) sy = h - 1;
        for (int x = 0; x < tw; ++x) {
            int sx = (int)(((float)x / tw) * w);
            if (sx >= w) sx = w - 1;
            const uint8_t *p = src + (size_t)(sy * w + sx) * bpp;
            uint8_t r = p[0], g = p[1], bl = p[2];
            argb[(size_t)y * tw + x] = (0xFFu << 24) | (r << 16) | (g << 8) | bl;
        }
    }
    free(img->data);
    free(img);

    // 旋转（90/180/270 顺时针）
    if (rotation == 90 || rotation == 270) {
        // 简化：仅为 90/270 做旋转（180 反向顺序可忽略视觉）
        // 这里用 int 数组原地旋转
        int dstW = th, dstH = tw;
        vector<uint32_t> out((size_t)dstH * dstW);
        for (int y = 0; y < th; ++y) {
            for (int x = 0; x < tw; ++x) {
                uint32_t c = argb[(size_t)y * tw + x];
                if (rotation == 90) {
                    out[(size_t)x * dstW + (dstW - 1 - y)] = c;
                } else { // 270
                    out[(size_t)(tw - 1 - x) * dstW + y] = c;
                }
            }
        }
        argb.swap(out);
        int t = tw; tw = th; th = t;
    } else if (rotation == 180) {
        std::reverse(argb.begin(), argb.end());
    }

    jintArray arr = copy_to_android(env, argb, tw, th);
    if (!arr) return nullptr;

    // 通过 Bitmap.createBitmap(int[], int, int, Config) 构造
    jclass bmpCls = env->FindClass("android/graphics/Bitmap");
    jmethodID create = env->GetStaticMethodID(bmpCls, "createBitmap",
        "([IIILandroid/graphics/Bitmap$Config;)Landroid/graphics/Bitmap;");
    jclass cfgCls = env->FindClass("android/graphics/Bitmap$Config");
    jfieldID argb8888 = env->GetStaticFieldID(cfgCls, "ARGB_8888",
        "Landroid/graphics/Bitmap$Config;");
    jobject cfg = env->GetStaticObjectField(cfgCls, argb8888);
    return env->CallStaticObjectMethod(bmpCls, create, arr, tw, th, cfg);
}

extern "C" JNIEXPORT jobject JNICALL
Java_com_example_rawviewer_nativebridge_LibRawBridge_extractThumbNative(
    JNIEnv *env, jobject thiz, jstring jPath) {
    // 简化实现：调用 LibRaw 的 unpack_thumb 取内嵌 JPEG。
    const char *cpath = env->GetStringUTFChars(jPath, nullptr);
    string path(cpath);
    env->ReleaseStringUTFChars(jPath, cpath);

    LibRaw raw;
    if (raw.open_file(path.c_str()) != LIBRAW_SUCCESS) return nullptr;
    if (raw.unpack_thumb() != LIBRAW_SUCCESS) { raw.recycle(); return nullptr; }
    libraw_processed_image_t *thumb = raw.dcraw_make_mem_thumb();
    raw.recycle();
    if (!thumb) return nullptr;

    // 内嵌缩略图通常是 JPEG，交给 Android BitmapFactory 解码
    jobject result = nullptr;
    if (thumb->type == LIBRAW_IMAGE_JPEG) {
        jclass factory = env->FindClass("android/graphics/BitmapFactory");
        jmethodID decode = env->GetStaticMethodID(factory, "decodeByteArray",
            "([BII)Landroid/graphics/Bitmap;");
        jbyteArray arr = env->NewByteArray((jsize)thumb->data_size);
        env->SetByteArrayRegion(arr, 0, (jsize)thumb->data_size,
            (const jbyte*)thumb->data);
        result = env->CallStaticObjectMethod(factory, decode, arr, 0,
            (jint)thumb->data_size);
    }
    free(thumb->data);
    free(thumb);
    return result;
}
