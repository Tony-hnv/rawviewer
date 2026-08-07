package com.example.rawviewer.ui

import android.app.Application
import android.graphics.Bitmap
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.rawviewer.data.ImageScanner
import com.example.rawviewer.decoder.ImageDecoderUtil
import com.example.rawviewer.model.ImageEntry
import com.example.rawviewer.model.ImageType
import com.example.rawviewer.process.ImagePreprocessor
import com.example.rawviewer.process.PreprocessOptions
import com.example.rawviewer.rename.FileRenamer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.io.File

data class UiState(
    val images: List<ImageEntry> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
    val selected: ImageEntry? = null,
    val decodedBitmap: Bitmap? = null,
    val previewBitmap: Bitmap? = null,
    val decoding: Boolean = false,
    val message: String? = null,
    // 预处理
    val brightness: Float = 0f,
    val contrast: Float = 0f,
    val rotationDeg: Float = 0f,
    // 重命名
    val renameTemplate: String = "{yyyy}{MM}{dd}_{HH}{mm}{ss}_{name}",
)

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state

    private var decodeJob: Job? = null

    fun loadImages() {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val list = try {
                ImageScanner.scan(getApplication())
            } catch (t: Throwable) {
                emptyList()
            }
            _state.value = _state.value.copy(loading = false, images = list,
                error = if (list.isEmpty()) "未找到支持的图片文件" else null)
        }
    }

    fun select(entry: ImageEntry) {
        _state.value = _state.value.copy(selected = entry,
            decodedBitmap = null, previewBitmap = null,
            brightness = 0f, contrast = 0f, rotationDeg = 0f)
        decodeCurrent()
    }

    fun decodeCurrent() {
        val entry = _state.value.selected ?: return
        decodeJob?.cancel()
        _state.value = _state.value.copy(decoding = true)
        decodeJob = viewModelScope.launch {
            val bmp = ImageDecoderUtil.decode(getApplication(),
                android.net.Uri.parse(entry.uriString), entry.type, 2048)
            val preview = bmp?.let { _applyPreprocess(it, _state.value) }
            _state.value = _state.value.copy(decoding = false,
                decodedBitmap = bmp, previewBitmap = preview)
        }
    }

    fun setBrightness(v: Float) {
        _state.value = _state.value.copy(brightness = v)
        _refreshPreview()
    }
    fun setContrast(v: Float) {
        _state.value = _state.value.copy(contrast = v)
        _refreshPreview()
    }
    fun setRotation(deg: Float) {
        _state.value = _state.value.copy(rotationDeg = deg)
        _refreshPreview()
    }

    private fun _refreshPreview() {
        val bmp = _state.value.decodedBitmap ?: return
        val st = _state.value
        val newPreview = _applyPreprocess(bmp, st)
        // 回收旧的中间预览图，避免滑动时内存膨胀
        st.previewBitmap?.takeIf { it !== bmp && it !== newPreview }?.recycle()
        _state.value = _state.value.copy(previewBitmap = newPreview)
    }

    private fun _applyPreprocess(bmp: Bitmap, st: UiState): Bitmap =
        ImagePreprocessor.apply(bmp, PreprocessOptions(
            rotationDeg = st.rotationDeg,
            brightness = st.brightness,
            contrast = st.contrast,
        ))

    fun setRenameTemplate(t: String) {
        _state.value = _state.value.copy(renameTemplate = t)
    }

    fun renameSelected() {
        val entry = _state.value.selected ?: return
        val template = _state.value.renameTemplate.ifBlank { "{name}" }
        viewModelScope.launch(Dispatchers.IO) {
            val app = getApplication<Application>()
            val file = File(entry.path)
            if (!file.exists()) {
                _state.value = _state.value.copy(message = "文件不存在")
                return@launch
            }
            val uri = android.net.Uri.parse(entry.uriString)
            val time = FileRenamer.readShootTime(app, entry.path, file.lastModified())
            val newBase = FileRenamer.buildTemplate(time, 0, file.nameWithoutExtension, template)
            val newName = FileRenamer.renameViaMediaStore(app, uri, file, newBase)
                ?: FileRenamer.renameFile(file, newBase)
            _state.value = _state.value.copy(
                message = newName?.let { "已重命名为 $it" } ?: "重命名失败")
            loadImages()
        }
    }

    fun bulkRename(template: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val images = _state.value.images
            val app = getApplication<Application>()
            var ok = 0
            var fail = 0
            // 从旧到新排序，避免覆盖冲突
            images.sortedBy { it.modifiedAt }.forEachIndexed { idx, entry ->
                val file = File(entry.path)
                if (!file.exists()) { fail++; return@forEachIndexed }
                val uri = android.net.Uri.parse(entry.uriString)
                val time = FileRenamer.readShootTime(app, entry.path, file.lastModified())
                val newBase = FileRenamer.buildTemplate(time, idx + 1,
                    file.nameWithoutExtension, template.ifBlank { "{name}" })
                val renamed = FileRenamer.renameViaMediaStore(app, uri, file, newBase)
                    ?: FileRenamer.renameFile(file, newBase)
                if (renamed != null) ok++ else fail++
            }
            _state.value = _state.value.copy(message = "批量重命名完成：成功 $ok，失败 $fail")
            loadImages()
        }
    }

    fun processAndExport() {
        val entry = _state.value.selected ?: return
        val bmp = _state.value.decodedBitmap ?: run {
            _state.value = _state.value.copy(message = "请先解码图片")
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            val opts = PreprocessOptions(
                rotationDeg = _state.value.rotationDeg,
                brightness = _state.value.brightness,
                contrast = _state.value.contrast,
            )
            val processed = _state.value.previewBitmap
                ?: ImagePreprocessor.apply(bmp, opts)
            val app = getApplication<Application>()
            val outDir = File(app.getExternalFilesDir(null), "processed")
            val outFile = File(outDir, "${entry.nameWithoutExtension()}_${System.currentTimeMillis()}.jpg")
            val ok = ImagePreprocessor.saveAsJpeg(processed, outFile)
            processed.recycleIfDiff(bmp)
            _state.value = _state.value.copy(
                message = if (ok) "已导出: ${outFile.absolutePath}" else "导出失败")
        }
    }

    fun clearMessage() {
        _state.value = _state.value.copy(message = null)
    }

    private fun Bitmap.recycleIfDiff(original: Bitmap) {
        if (this !== original) recycle()
    }
}

private fun ImageEntry.nameWithoutExtension(): String =
    name.substringBeforeLast('.')
