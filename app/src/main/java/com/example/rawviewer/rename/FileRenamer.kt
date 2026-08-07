package com.example.rawviewer.rename

import android.content.Context
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 重命名：支持按 EXIF 拍摄时间以及自定义模板。
 * 模板占位符：
 *   {yyyy} {MM} {dd} {HH} {mm} {ss} — 拍摄时间
 *   {name}  — 原文件名（不含扩展名）
 *   {n}     — 序号（批量时）
 */
object FileRenamer {

    fun buildTemplate(time: Date, index: Int, originalName: String, template: String): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.US)
        return template
            .replace("{yyyy}", SimpleDateFormat("yyyy", Locale.US).format(time))
            .replace("{MM}", SimpleDateFormat("MM", Locale.US).format(time))
            .replace("{dd}", SimpleDateFormat("dd", Locale.US).format(time))
            .replace("{HH}", SimpleDateFormat("HH", Locale.US).format(time))
            .replace("{mm}", SimpleDateFormat("mm", Locale.US).format(time))
            .replace("{ss}", SimpleDateFormat("ss", Locale.US).format(time))
            .replace("{name}", originalName)
            .replace("{n}", index.toString())
    }

    /**
     * 从 EXIF 读取拍摄时间戳；失败返回文件修改时间。
     */
    fun readShootTime(context: Context, path: String, fallback: Long): Date {
        return try {
            val exif = ExifInterface(path)
            val dt = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)
            if (dt != null) {
                val fmt = SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US)
                fmt.parse(dt) ?: Date(fallback)
            } else {
                Date(fallback)
            }
        } catch (t: Throwable) {
            Date(fallback)
        }
    }

    /**
     * 重命名文件（保证目标名唯一，避免覆盖）。
     * @return 新文件名；失败返回 null
     */
    fun renameFile(file: File, newBaseName: String): String? {
        val ext = file.extension
        var candidate = File(file.parent, "$newBaseName.$ext")
        var n = 1
        while (candidate.exists() && candidate != file) {
            candidate = File(file.parent, "${newBaseName}_$n.$ext")
            n++
        }
        return if (file.renameTo(candidate)) candidate.name else null
    }
}
