package com.example.rawviewer.model

/**
 * 一张图片文件（RAW/HEIF/JPG），含类型与缩略图路径信息。
 */
data class ImageEntry(
    val id: Long,
    val name: String,
    val path: String,          // 绝对路径（APP 私有目录或共享目录）
    val uriString: String,     // content:// 或 file://
    val sizeBytes: Long,
    val modifiedAt: Long,
    val type: ImageType,
    val width: Int = 0,
    val height: Int = 0,
)

enum class ImageType(val display: String, val extensions: List<String>) {
    RAW("RAW", listOf("arw", "raf", "cr2", "cr3", "nef", "dng", "orf", "rw2", "pef", "srw")),
    HEIF("HEIF", listOf("heic", "heif")),
    JPG("JPG", listOf("jpg", "jpeg")),
    OTHER("其他", emptyList());

    companion object {
        private val rawSet = RAW.extensions.toHashSet()
        private val heifSet = HEIF.extensions.toHashSet()
        private val jpgSet = JPG.extensions.toHashSet()

        fun fromFileName(name: String): ImageType {
            val ext = name.substringAfterLast('.', "").lowercase()
            return when {
                ext in rawSet -> RAW
                ext in heifSet -> HEIF
                ext in jpgSet -> JPG
                else -> OTHER
            }
        }
    }
}
