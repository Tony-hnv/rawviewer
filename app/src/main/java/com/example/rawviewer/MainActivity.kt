package com.example.rawviewer

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.example.rawviewer.ui.MainScreen
import com.example.rawviewer.ui.MainViewModel
import com.example.rawviewer.ui.theme.RAWViewerTheme

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { viewModel.loadImages() }

    // Android 11+ 需要用户授予“所有文件访问”才能写入相册（重命名/覆盖）。
    private val manageStorageLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { viewModel.loadImages() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            RAWViewerTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    MainScreen(viewModel)
                }
            }
        }

        requestPermissions()
    }

    override fun onResume() {
        super.onResume()
        if (hasPermission()) viewModel.loadImages()
    }

    private fun requestPermissions() {
        // Android 11+：先要求“所有文件访问”（写相册需要），再申请读权限
        if (Build.VERSION.SDK_INT >= 30 &&
            !Environment.isExternalStorageManager()) {
            try {
                manageStorageLauncher.launch(Intent(
                    Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                    Uri.parse("package:$packageName")
                ))
            } catch (e: Throwable) {
                // 部分设备无此 intent，退回常规读权限
            }
        }
        val perms = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES)
                != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.READ_MEDIA_IMAGES)
                perms.add(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            }
        }
        if (perms.isNotEmpty()) {
            permissionLauncher.launch(perms.toTypedArray())
        }
    }

    private fun hasPermission(): Boolean {
        if (Build.VERSION.SDK_INT >= 33) {
            // READ_MEDIA_IMAGES 或 READ_MEDIA_VISUAL_USER_SELECTED 任一有效即可读取
            val images = ContextCompat.checkSelfPermission(
                this, Manifest.permission.READ_MEDIA_IMAGES
            ) == PackageManager.PERMISSION_GRANTED
            val partial = ContextCompat.checkSelfPermission(
                this, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED
            ) == PackageManager.PERMISSION_GRANTED
            return images || partial
        }
        return ContextCompat.checkSelfPermission(
            this, Manifest.permission.READ_EXTERNAL_STORAGE
        ) == PackageManager.PERMISSION_GRANTED
    }
}
