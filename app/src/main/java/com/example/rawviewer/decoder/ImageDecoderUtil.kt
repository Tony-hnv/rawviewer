package com.example.rawviewer.decoder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.net.Uri
import android.provider.MediaStore
import com.example.rawviewer.model.ImageType
import com.example.rawviewer.nativebridge.LibRawBridge
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * 统一图片解码器：
 * - RAW   -> LibRaw 全像素解码；失败则取内嵌 JPEG 缩略图
 * - HEIF  -> ImageDecoder（Android 9+ 系统支持，API 28+）
 * - JPG   -> BitmapFactory
 */
object ImageDecoderUtil {

    object Holder {
        val libRawBridge = LibRawBridge
    }

    /**
     * 解码为 Bitmap（按最长边缩小采样，避免 OOM）。
     */
    suspend fun decode(context: Context, uri: Uri, type: ImageType,
                       maxDimension: Int = 4096): Bitmap? = withContext(Dispatchers.Default) {
        try {
            when (type) {
                ImageType.RAW -> {
                    val path = resolveFilePath(context, uri)
                    if (path != null) decodeRaw(path, maxDimension)
                    else decodeRawFromFd(context, uri, maxDimension)
                }
                ImageType.HEIF -> decodeHeif(context, uri, maxDimension)
                ImageType.JPG -> {
                    val path = resolveFilePath(context, uri)
                    if (path != null) decodeJpeg(path, maxDimension)
                    else decodeJpegFromFd(context, uri, maxDimension)
                }
                else -> null
            }
        } catch (t: Throwable) {
            null
        }
    }

    /**
     * 从 MediaStore / content URI 解析真实文件路径；失败返回 null。
     */
    private fun resolveFilePath(context: Context, uri: Uri): String? {
        if (uri.scheme == "file") return uri.path
        if (uri.scheme != "content") return uri.path
        return try {
            val proj = arrayOf(MediaStore.Images.Media.DATA)
            val c = context.contentResolver.query(uri, proj, null, null, null)
            c?.use {
                if (it.moveToFirst()) {
                    val idx = it.getColumnIndex(MediaStore.Images.Media.DATA)
                    if (idx >= 0) it.getString(idx)
                } else null
            }
        } catch (t: Throwable) {
            null
        }
    }

    private fun decodeRawFromFd(context: Context, uri: Uri, maxDimension: Int): Bitmap? =
        copyToCacheAndDecode(context, uri, maxDimension)

    private fun copyToCacheAndDecode(context: Context, uri: Uri, maxDimension: Int): Bitmap? {
        return try {
            val cache = File(context.cacheDir, "raw_${System.currentTimeMillis()}")
            context.contentResolver.openInputStream(uri)?.use { input ->
                cache.outputStream().use { out -> input.copyTo(out) }
            } ?: return null
            val bmp = decodeRaw(cache.absolutePath, maxDimension)
            cache.delete()
            bmp
        } catch (t: Throwable) {
            null
        }
    }

    private fun decodeJpegFromFd(context: Context, uri: Uri, maxDimension: Int): Bitmap? {
        return try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                val bytes = input.readBytes()
                val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                opts.inSampleSize = computeSampleSize(opts.outWidth, opts.outHeight, maxDimension)
                opts.inJustDecodeBounds = false
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
            }
        } catch (t: Throwable) {
            null
        }
    }

    private fun decodeRaw(path: String, maxDimension: Int): Bitmap? {
        // 1) 全像素解码
        Holder.libRawBridge.decodeFile(path, maxDimension, 0)?.let { return it }
        // 2) 降级：内嵌 JPEG 缩略图
        Holder.libRawBridge.extractThumbnail(path)?.let { return it }
        return null
    }

    @Suppress("DEPRECATION")
    private fun decodeHeif(context: Context, uri: Uri, maxDimension: Int): Bitmap? {
        // 尝试新版 ImageDecoder
        return try {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
                val sample = maxOf(1, floorDivToSample(info.size.width, info.size.height, maxDimension))
                decoder.setTargetSampleSize(sample)
            }
        } catch (t: Throwable) {
            // 降级：BoundInBitmap 方式
            val fd = context.contentResolver.openFileDescriptor(uri, "r") ?: return null
            fd.use {
                val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFileDescriptor(it.fileDescriptor, null, opts)
                opts.inSampleSize = computeSampleSize(opts.outWidth, opts.outHeight, maxDimension)
                opts.inJustDecodeBounds = false
                BitmapFactory.decodeFileDescriptor(it.fileDescriptor, null, opts)
            }
        }
    }

    private fun decodeJpeg(path: String, maxDimension: Int): Bitmap? {
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, opts)
        opts.inSampleSize = computeSampleSize(opts.outWidth, opts.outHeight, maxDimension)
        opts.inJustDecodeBounds = false
        return BitmapFactory.decodeFile(path, opts)
    }

    private fun computeSampleSize(w: Int, h: Int, maxDim: Int): Int {
        if (w <= 0 || h <= 0 || maxDim <= 0) return 1
        var sample = 1
        val longest = maxOf(w, h)
        while (longest / (sample * 2) >= maxDim) sample *= 2
        return sample
    }

    private fun floorDivToSample(w: Int, h: Int, maxDim: Int): Int {
        val sample = computeSampleSize(w, h, maxDim)
        // 返回 2 的幂作为 target sample
        return sample
    }

    /**
     * 旋转 Bitmap。
     */
    fun rotate(bitmap: Bitmap, degrees: Float): Bitmap {
        if (degrees == 0f) return bitmap
        val m = Matrix().apply { postRotate(degrees) }
        val out = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
        if (out !== bitmap) bitmap.recycle()
        return out
    }
}
