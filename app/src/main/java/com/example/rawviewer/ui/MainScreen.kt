package com.example.rawviewer.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(viewModel: MainViewModel) {
    val state by viewModel.state.collectAsState()
    var showBulkRename by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }

    // 进入界面即触发一次扫描（防止依赖 onResume 时序导致空白）
    LaunchedEffect(Unit) {
        viewModel.loadImages()
    }

    LaunchedEffect(state.message) {
        state.message?.let { m ->
            snackbarHostState.showSnackbar(m)
            viewModel.clearMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("RAW Viewer") },
                actions = {
                    TextButton(onClick = { showBulkRename = true }) { Text("批量重命名") }
                    IconButton(onClick = { viewModel.loadImages() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "刷新")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            if (state.loading) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            } else if (state.images.isEmpty()) {
                Column(Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.PhotoLibrary, null, Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.outline)
                    Spacer(Modifier.height(12.dp))
                    Text(state.error ?: "暂无图片", style = MaterialTheme.typography.bodyLarge)
                }
            } else {
                Row(Modifier.fillMaxSize()) {
                    // 左侧文件列表
                    FileListPane(
                        images = state.images,
                        selected = state.selected,
                        onSelect = { viewModel.select(it) },
                        modifier = Modifier.weight(1f).fillMaxHeight()
                    )
                    // 右侧预览+编辑
                    PreviewPane(
                        state = state,
                        onBrightness = viewModel::setBrightness,
                        onContrast = viewModel::setContrast,
                        onRotate = viewModel::setRotation,
                        onRenameTemplate = viewModel::setRenameTemplate,
                        onRename = viewModel::renameSelected,
                        onExport = viewModel::processAndExport,
                        modifier = Modifier.weight(2f).fillMaxHeight()
                    )
                }
            }
        }
    }

    if (showBulkRename) {
        BulkRenameDialog(
            template = state.renameTemplate,
            onTemplateChange = viewModel::setRenameTemplate,
            onConfirm = {
                viewModel.bulkRename(state.renameTemplate)
                showBulkRename = false
            },
            onDismiss = { showBulkRename = false }
        )
    }
}

@Composable
private fun FileListPane(
    images: List<com.example.rawviewer.model.ImageEntry>,
    selected: com.example.rawviewer.model.ImageEntry?,
    onSelect: (com.example.rawviewer.model.ImageEntry) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(modifier, color = MaterialTheme.colorScheme.surfaceVariant) {
        LazyColumn(Modifier.fillMaxSize()) {
            items(images, key = { it.id }) { entry ->
                val isSel = selected?.id == entry.id
                val typeColor = when (entry.type) {
                    com.example.rawviewer.model.ImageType.RAW -> MaterialTheme.colorScheme.tertiary
                    com.example.rawviewer.model.ImageType.HEIF -> MaterialTheme.colorScheme.secondary
                    else -> MaterialTheme.colorScheme.primary
                }
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { onSelect(entry) }
                        .padding(10.dp),
                ) {
                    Text(entry.name, maxLines = 1, style = MaterialTheme.typography.bodyMedium,
                        color = if (isSel) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        AssistChip(onClick = {}, label = { Text(entry.type.display) })
                        Spacer(Modifier.width(4.dp))
                        Text(formatSize(entry.sizeBytes), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun PreviewPane(
    state: UiState,
    onBrightness: (Float) -> Unit,
    onContrast: (Float) -> Unit,
    onRotate: (Float) -> Unit,
    onRenameTemplate: (String) -> Unit,
    onRename: () -> Unit,
    onExport: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.padding(16.dp)) {
        if (state.decoding) {
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.decodedBitmap != null) {
            Image(
                bitmap = state.decodedBitmap.asImageBitmap(),
                contentDescription = state.selected?.name,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentScale = ContentScale.Fit
            )
        } else {
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                Text(if (state.selected == null) "← 选择左侧图片" else "无法解码此图片",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.outline)
            }
        }

        Spacer(Modifier.height(16.dp))

        // 预处理控件
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("预处理", style = MaterialTheme.typography.titleSmall)
                SliderRow("亮度", state.brightness, -100f..100f, onBrightness)
                SliderRow("对比度", state.contrast, -100f..100f, onContrast)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("旋转: ${state.rotationDeg.roundToInt()}°", Modifier.width(80.dp))
                    IconButton(onClick = { onRotate(state.rotationDeg - 90f) }) {
                        Icon(Icons.Default.RotateLeft, "左旋")
                    }
                    IconButton(onClick = { onRotate(state.rotationDeg + 90f) }) {
                        Icon(Icons.Default.RotateRight, "右旋")
                    }
                    IconButton(onClick = { onRotate(0f) }) {
                        Icon(Icons.Default.Refresh, "复位")
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = onExport, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Default.Save, null); Spacer(Modifier.width(6.dp)); Text("导出 JPEG")
                    }
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        // 重命名
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("重命名", style = MaterialTheme.typography.titleSmall)
                TextField(
                    value = state.renameTemplate,
                    onValueChange = onRenameTemplate,
                    singleLine = true,
                    label = { Text("{yyyy}{MM}{dd}_{HH}{mm}{ss}_{name}") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedButton(onClick = onRename, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Default.DriveFileRenameOutline, null)
                    Spacer(Modifier.width(6.dp))
                    Text("重命名当前文件")
                }
            }
        }
    }
}

@Composable
private fun SliderRow(label: String, value: Float, range: ClosedFloatingPointRange<Float>,
                      onChange: (Float) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.width(60.dp))
        Slider(
            value = value,
            onValueChange = onChange,
            valueRange = range,
            modifier = Modifier.weight(1f)
        )
        Text("${value.roundToInt()}", Modifier.width(40.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
    }
}

@Composable
private fun BulkRenameDialog(
    template: String,
    onTemplateChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("批量重命名") },
        text = {
            Column {
                Text("模板可用：{yyyy}{MM}{dd}{HH}{mm}{ss}{name}{n}")
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = template,
                    onValueChange = onTemplateChange,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text("重命名") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消") }
        }
    )
}

private fun formatSize(bytes: Long): String {
    if (bytes <= 0) return "0 B"
    val units = arrayOf("B", "KB", "MB", "GB")
    var v = bytes.toDouble()
    var i = 0
    while (v >= 1024 && i < units.size - 1) { v /= 1024; i++ }
    return String.format("%.1f %s", v, units[i])
}
