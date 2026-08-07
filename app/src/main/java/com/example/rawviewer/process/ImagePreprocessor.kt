package com.example.rawviewer.process

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import java.io.File
import java.io.FileOutputStream

data class PreprocessOptions(
    val rotationDeg: Float = 0f,       // 0/90/180/270
    val brightness: Float = 0f,        // -100..100
    val contrast: Float = 0f,          // -100..100
    val cropRect: android.graphics.Rect? = null, // 原图坐标系裁剪区域
)

/**
 * 图片预处理：旋转、调亮度/对比度、裁剪，并导出 JPEG。
 */
object ImagePreprocessor {

    /**
     * 应用预处理并输出为 Bitmap。
     */
    fun apply(bitmap: Bitmap, opts: PreprocessOptions): Bitmap {
        var bmp = bitmap
        // 1) 亮度/对比度
        val brightness = opts.brightness
        val contrast = opts.contrast
        if (brightness != 0f || contrast != 0f) {
            val scale = 1f + contrast / 100f
            val translate = brightness * (255f / 100f)
            val cm = ColorMatrix(floatArrayOf(
                scale, 0f, 0f, 0f, translate,
                0f, scale, 0f, 0f, translate,
                0f, 0f, scale, 0f, translate,
                0f, 0f, 0f, 1f, 0f,
            ))
            val out = Bitmap.createBitmap(bmp.width, bmp.height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(out)
            val paint = Paint().apply { colorFilter = ColorMatrixColorFilter(cm) }
            canvas.drawBitmap(bmp, 0f, 0f, paint)
            if (out !== bmp) bmp.recycle()
            bmp = out
        }

        // 2) 裁剪
        opts.cropRect?.let { rect ->
            val w = rect.width().coerceAtLeast(1)
            val h = rect.height().coerceAtLeast(1)
            val cropped = Bitmap.createBitmap(bmp, rect.left, rect.top, w, h)
            if (cropped !== bmp) bmp.recycle()
            bmp = cropped
        }

        // 3) 旋转
        if (opts.rotationDeg != 0f) {
            val m = Matrix().apply { postRotate(opts.rotationDeg) }
            val rotated = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
            if (rotated !== bmp) bmp.recycle()
            bmp = rotated
        }
        return bmp
    }

    /**
     * 保存为 JPEG 到目标文件。
     */
    fun saveAsJpeg(bitmap: Bitmap, dest: File, quality: Int = 92): Boolean {
        return try {
            dest.parentFile?.mkdirs()
            FileOutputStream(dest).use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
                out.flush()
            }
            true
        } catch (t: Throwable) {
            false
        }
    }
}
