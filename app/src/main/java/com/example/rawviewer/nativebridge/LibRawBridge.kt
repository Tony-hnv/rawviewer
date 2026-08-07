package com.example.rawviewer.nativebridge

import android.graphics.Bitmap

/**
 * LibRaw (原生 C) 解码桥。
 *
 * 依赖预编译的 librawlite.so（ARM64 / ARM32，见 README 与 docs/BUILD_LIBRAW.md）。
 * 若 .so 缺失，isAvailable() 返回 false，App 自动降级为 JPEG 内嵌预览。
 */
object LibRawBridge {

    @Volatile
    private var _loaded = false

    init {
        // 只尝试加载，失败不抛异常（app 可降级）。
        try {
            System.loadLibrary("rawlite")
            _loaded = true
        } catch (t: Throwable) {
            _loaded = false
        }
    }

    fun isAvailable(): Boolean = _loaded

    /**
     * 解码 RAW 文件为 16-bit RGB Bitmap。
     * @param path 文件绝对路径
     * @param maxDimension 限制最长边（0=原尺寸），避免超大 RAW 撑爆内存
     * @param rotation 期望旋转角度（0/90/180/270）
     * @return 解码后的 Bitmap；失败返回 null
     */
    fun decodeFile(path: String, maxDimension: Int = 4096, rotation: Int = 0): Bitmap? {
        if (!_loaded) return null
        return try {
            decodeNative(path, maxDimension, rotation)
        } catch (t: Throwable) {
            null
        }
    }

    /**
     * 从 RAW 中抽取内嵌 JPEG 缩略图（比全像素解码快得多），失败返回 null。
     */
    fun extractThumbnail(path: String): Bitmap? {
        if (!_loaded) return null
        return try {
            extractThumbNative(path)
        } catch (t: Throwable) {
            null
        }
    }

    private external fun decodeNative(path: String, maxDimension: Int, rotation: Int): Bitmap?
    private external fun extractThumbNative(path: String): Bitmap?
}
