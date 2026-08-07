package com.example.rawviewer.data

import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import com.example.rawviewer.model.ImageEntry
import com.example.rawviewer.model.ImageType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 扫描系统相册中的 RAW / HEIF / JPG 图片。
 */
object ImageScanner {

    private val allowedExt = HashSet<String>().apply {
        addAll(ImageType.RAW.extensions)
        addAll(ImageType.HEIF.extensions)
        addAll(ImageType.JPG.extensions)
    }

    suspend fun scan(context: Context): List<ImageEntry> = withContext(Dispatchers.IO) {
        val result = ArrayList<ImageEntry>()
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.DATA,
            MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.DATE_MODIFIED,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT,
        )
        val selection = "${MediaStore.Images.Media.DATA} IS NOT NULL"
        try {
            val cursor = context.contentResolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection, selection, null,
                "${MediaStore.Images.Media.DATE_MODIFIED} DESC"
            ) ?: return@withContext emptyList()

            cursor.use { c ->
                val idCol = c.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
                val nameCol = c.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
                val dataCol = c.getColumnIndexOrThrow(MediaStore.Images.Media.DATA)
                val sizeCol = c.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE)
                val modCol = c.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_MODIFIED)
                val wCol = c.getColumnIndex(MediaStore.Images.Media.WIDTH)
                val hCol = c.getColumnIndex(MediaStore.Images.Media.HEIGHT)

                while (c.moveToNext()) {
                    val name = c.getString(nameCol) ?: continue
                    val ext = name.substringAfterLast('.', "").lowercase()
                    if (ext !in allowedExt) continue
                    val path = c.getString(dataCol) ?: continue
                    val id = c.getLong(idCol)
                    val size = if (sizeCol >= 0) c.getLong(sizeCol) else 0L
                    val mod = if (modCol >= 0) c.getLong(modCol) else System.currentTimeMillis() / 1000
                    val w = if (wCol >= 0) c.getInt(wCol) else 0
                    val h = if (hCol >= 0) c.getInt(hCol) else 0
                    val uri = Uri.withAppendedPath(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id.toString()
                    )
                    result.add(
                        ImageEntry(
                            id = id, name = name, path = path,
                            uriString = uri.toString(),
                            sizeBytes = size, modifiedAt = mod * 1000,
                            type = ImageType.fromFileName(name), width = w, height = h,
                        )
                    )
                }
            }
        } catch (t: Throwable) {
            // 权限不足等，返回已收集的
        }
        result
    }
}
