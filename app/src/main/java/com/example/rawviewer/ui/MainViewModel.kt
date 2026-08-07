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
            decodedBitmap = null, brightness = 0f, contrast = 0f, rotationDeg = 0f)
        decodeCurrent()
    }

    fun decodeCurrent() {
        val entry = _state.value.selected ?: return
        decodeJob?.cancel()
        _state.value = _state.value.copy(decoding = true)
        decodeJob = viewModelScope.launch {
            val bmp = ImageDecoderUtil.decode(getApplication(),
                android.net.Uri.parse(entry.uriString), entry.type, 4096)
            _state.value = _state.value.copy(decoding = false, decodedBitmap = bmp)
        }
    }

    fun setBrightness(v: Float) {
        _state.value = _state.value.copy(brightness = v)
        _refreshPreprocessed(false)
    }
    fun setContrast(v: Float) {
        _state.value = _state.value.copy(contrast = v)
        _refreshPreprocessed(false)
    }
    fun setRotation(deg: Float) {
        _state.value = _state.value.copy(rotationDeg = deg)
        _refreshPreprocessed(true)
    }

    private fun _refreshPreprocessed(redecode: Boolean) {
        val entry = _state.value.selected ?: return
        if (redecode) {
            decodeCurrent()
            return
        }
        // 简单：重新从原图应用（亮度/对比度不会重新解码）
    }

    fun setRenameTemplate(t: String) {
        _state.value = _state.value.copy(renameTemplate = t)
    }

    fun renameSelected() {
        val entry = _state.value.selected ?: return
        val template = _state.value.renameTemplate.ifBlank { "{name}" }
        viewModelScope.launch(Dispatchers.IO) {
            val file = File(entry.path)
            if (!file.exists()) {
                _state.value = _state.value.copy(message = "文件不存在")
                return@launch
            }
            val time = FileRenamer.readShootTime(getApplication(), entry.path, file.lastModified())
            val newBase = FileRenamer.buildTemplate(time, 0, file.nameWithoutExtension, template)
            val newName = FileRenamer.renameFile(file, newBase)
            _state.value = _state.value.copy(
                message = newName?.let { "已重命名为 $it" } ?: "重命名失败")
            loadImages()
        }
    }

    fun bulkRename(template: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val images = _state.value.images
            var ok = 0
            var fail = 0
            // 从旧到新排序，避免覆盖冲突
            images.sortedBy { it.modifiedAt }.forEachIndexed { idx, entry ->
                val file = File(entry.path)
                if (!file.exists()) { fail++; return@forEachIndexed }
                val time = FileRenamer.readShootTime(getApplication(), entry.path, file.lastModified())
                val newBase = FileRenamer.buildTemplate(time, idx + 1,
                    file.nameWithoutExtension, template.ifBlank { "{name}" })
                if (FileRenamer.renameFile(file, newBase) != null) ok++ else fail++
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
            val processed = ImagePreprocessor.apply(bmp, opts)
            val outDir = File(getApplication().getExternalFilesDir(null), "processed")
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
