const {
  createRunOncePlugin,
  withAppBuildGradle,
  withDangerousMod,
  withGradleProperties,
  withMainApplication,
  withProjectBuildGradle,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PACKAGE_IMPORT = "com.rawview.rawdecoder.RawDecoderPackage";
const LIBRAW_DEPENDENCY = 'implementation("com.github.dburckh:AndroidLibRaw:2.0.7")';

const rawDecoderModule = `package com.rawview.rawdecoder

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.homesoft.photo.libraw.LibRaw
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.roundToInt

class RawDecoderModule(private val appContext: ReactApplicationContext) : ReactContextBaseJavaModule(appContext) {
  override fun getName() = "RawDecoder"

  private fun persistUriPermission(uri: Uri) {
    if (uri.scheme != "content") return
    try {
      appContext.contentResolver.takePersistableUriPermission(
        uri,
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
      )
    } catch (_: SecurityException) {
      // Some providers grant a session-only URI. The app can still copy the selected file now.
    }
  }

  private fun inputStreamFor(uri: Uri) = when (uri.scheme) {
    "file" -> File(requireNotNull(uri.path) { "File path is unavailable." }).inputStream()
    else -> requireNotNull(appContext.contentResolver.openInputStream(uri)) { "Unable to read the selected file." }
  }

  @ReactMethod
  fun copyToLibrary(sourceUri: String, destinationUri: String, promise: Promise) {
    try {
      val source = Uri.parse(sourceUri)
      val destination = Uri.parse(destinationUri)
      persistUriPermission(source)
      val outputFile = File(requireNotNull(destination.path) { "Destination path is unavailable." })
      outputFile.parentFile?.mkdirs()
      inputStreamFor(source).use { input ->
        outputFile.outputStream().use { output -> input.copyTo(output) }
      }
      check(outputFile.exists() && outputFile.length() > 0L) { "LIBRARY_COPY_FAILED: Copied file is empty." }
      promise.resolve("file://" + outputFile.absolutePath)
    } catch (error: Exception) {
      promise.reject("LIBRARY_COPY_FAILED", error.message ?: "Unable to import selected file.", error)
    }
  }

  @ReactMethod
  fun renameLibraryFile(localUri: String, sourceUri: String?, newFileName: String, promise: Promise) {
    try {
      val localFile = File(requireNotNull(Uri.parse(localUri).path) { "Local file path is unavailable." })
      check(localFile.exists()) { "LOCAL_FILE_MISSING: Import the file again before renaming." }
      val renamedLocalFile = File(requireNotNull(localFile.parentFile), newFileName)
      check(!renamedLocalFile.exists() || renamedLocalFile.canonicalPath == localFile.canonicalPath) { "A file with this name already exists." }
      check(localFile.renameTo(renamedLocalFile)) { "LOCAL_RENAME_FAILED: Android could not rename the local copy." }

      var resolvedSourceUri = sourceUri
      var sourceRenamed = false
      var sourceRenameError: String? = null
      if (!sourceUri.isNullOrBlank()) {
        try {
          val source = Uri.parse(sourceUri)
          persistUriPermission(source)
          if (source.scheme == "content") {
            val renamedSource = DocumentsContract.renameDocument(appContext.contentResolver, source, newFileName)
            if (renamedSource != null) {
              resolvedSourceUri = renamedSource.toString()
              sourceRenamed = true
            }
          } else if (source.scheme == "file") {
            val sourceFile = File(requireNotNull(source.path))
            if (sourceFile.exists() && sourceFile.canonicalPath != localFile.canonicalPath) {
              sourceRenamed = sourceFile.renameTo(File(requireNotNull(sourceFile.parentFile), newFileName))
              if (sourceRenamed) resolvedSourceUri = "file://" + File(requireNotNull(sourceFile.parentFile), newFileName).absolutePath
            }
          }
        } catch (error: Exception) {
          sourceRenameError = error.message
        }
      }

      val response = Arguments.createMap().apply {
        putString("uri", "file://" + renamedLocalFile.absolutePath)
        putString("sourceUri", resolvedSourceUri)
        putBoolean("sourceRenamed", sourceRenamed)
        if (sourceRenameError != null) putString("sourceRenameError", sourceRenameError)
      }
      promise.resolve(response)
    } catch (error: Exception) {
      promise.reject("LOCAL_RENAME_FAILED", error.message ?: "Unable to rename local file.", error)
    }
  }

  private fun decodeSoftwareBitmap(sourcePath: String): Bitmap {
    return LibRaw().use { decoder ->
      val openStatus = decoder.open(sourcePath)
      check(openStatus == 0) { "RAW_OPEN_FAILED: \$openStatus" }
      decoder.setQuality(3)
      decoder.setHalfSize(false)
      decoder.setOutputColorSpace(LibRaw.COLORSPACE_SRGB)
      decoder.setOutputBps(8)
      val processStatus = decoder.dcrawProcess()
      check(processStatus == 0) { "RAW_PROCESS_FAILED: \$processStatus" }
      decoder.getMutableBitmap(Bitmap.Config.ARGB_8888)
    }
  }

  private fun createEncodablePreview(decodedBitmap: Bitmap): Bitmap {
    val maxPreviewEdge = 1600
    val longestEdge = maxOf(decodedBitmap.width, decodedBitmap.height)
    val scale = minOf(1f, maxPreviewEdge.toFloat() / longestEdge.toFloat())
    val targetWidth = (decodedBitmap.width * scale).roundToInt().coerceAtLeast(1)
    val targetHeight = (decodedBitmap.height * scale).roundToInt().coerceAtLeast(1)
    val softwarePreview = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(softwarePreview)
    val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
    canvas.drawBitmap(decodedBitmap, null, Rect(0, 0, targetWidth, targetHeight), paint)
    return softwarePreview
  }

  @ReactMethod
  fun decodeRaw(sourceUri: String, promise: Promise) {
    try {
      val uri = Uri.parse(sourceUri)
      val sourceFile = if (uri.scheme == "file") {
        File(requireNotNull(uri.path) { "RAW file path is unavailable." })
      } else {
        val importedCopy = File(appContext.cacheDir, "raw-import-\${UUID.randomUUID()}")
        appContext.contentResolver.openInputStream(uri).use { input ->
          requireNotNull(input) { "Unable to read the selected RAW file." }
          importedCopy.outputStream().use { output -> input.copyTo(output) }
        }
        importedCopy
      }

      val decodedBitmap = decodeSoftwareBitmap(sourceFile.absolutePath)
      try {
        val previewBitmap = createEncodablePreview(decodedBitmap)
        val outputFile = File(appContext.cacheDir, "raw-preview-\${UUID.randomUUID()}.png")
        val temporaryFile = File(appContext.cacheDir, "raw-preview-\${UUID.randomUUID()}.tmp")
        try {
          FileOutputStream(temporaryFile).use { stream ->
            check(previewBitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) { "RAW_PREVIEW_WRITE_FAILED: PNG encoding returned false." }
          }
          check(temporaryFile.length() > 0L) { "RAW_PREVIEW_WRITE_FAILED: PNG output is empty." }
          check(temporaryFile.renameTo(outputFile)) { "RAW_PREVIEW_WRITE_FAILED: Unable to finalize preview cache." }
          promise.resolve("file://\${outputFile.absolutePath}")
        } finally {
          if (temporaryFile.exists()) temporaryFile.delete()
          previewBitmap.recycle()
        }
      } finally {
        decodedBitmap.recycle()
      }
    } catch (error: Exception) {
      promise.reject("RAW_DECODE_FAILED", error.message ?: "Unable to decode RAW file.", error)
    }
  }
}
`;

const rawDecoderPackage = `package com.rawview.rawdecoder

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class RawDecoderPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(RawDecoderModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`;

function addJitPackRepository(contents) {
  if (contents.includes("jitpack.io")) return contents;
  const repositoriesBlock = /allprojects\s*\{\s*repositories\s*\{/;
  if (repositoriesBlock.test(contents)) {
    return contents.replace(repositoriesBlock, (match) => `${match}\n        maven { url "https://jitpack.io" }`);
  }
  return `${contents}\nallprojects { repositories { maven { url "https://jitpack.io" } } }\n`;
}

function addNativeDependency(contents) {
  if (contents.includes("AndroidLibRaw")) return contents;
  return contents.replace(/dependencies\s*\{/, (match) => `${match}\n    ${LIBRAW_DEPENDENCY}`);
}

function registerRawDecoderPackage(contents, language) {
  if (contents.includes(PACKAGE_IMPORT)) return contents;
  const importStatement = language === "java"
    ? `import ${PACKAGE_IMPORT};`
    : `import ${PACKAGE_IMPORT}`;
  const withImport = contents.replace(/^(package\s+[^\n;]+;?)$/m, (match) => `${match}\n\n${importStatement}`);

  if (language === "java") {
    return withImport.replace(
      /new PackageList\(this\)\.getPackages\(\)/,
      "new PackageList(this).getPackages() {{RAW_DECODER_REGISTRATION}}",
    );
  }

  const packageListPattern = /PackageList\(this\)\.packages\.apply\s*\{/;
  if (!packageListPattern.test(withImport)) {
    throw new Error("Unable to register RawDecoderPackage in MainApplication.kt.");
  }
  return withImport.replace(packageListPattern, (match) => `${match}\n          add(RawDecoderPackage())`);
}

function withRawDecoder(config) {
  config = withGradleProperties(config, (modConfig) => {
    const safeBuildProperties = {
      "org.gradle.jvmargs": "-Xmx1280m -XX:MaxMetaspaceSize=512m -XX:ReservedCodeCacheSize=160m -Dfile.encoding=UTF-8",
      "org.gradle.daemon": "false",
      "org.gradle.parallel": "false",
      "org.gradle.workers.max": "1",
      "kotlin.compiler.execution.strategy": "in-process",
    };
    modConfig.modResults = modConfig.modResults.filter(
      (item) => !Object.hasOwn(safeBuildProperties, item.key),
    );
    for (const [key, value] of Object.entries(safeBuildProperties)) {
      modConfig.modResults.push({ type: "property", key, value });
    }
    return modConfig;
  });

  config = withProjectBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = addJitPackRepository(modConfig.modResults.contents);
    return modConfig;
  });

  config = withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = addNativeDependency(modConfig.modResults.contents);
    return modConfig;
  });

  config = withMainApplication(config, (modConfig) => {
    const { language } = modConfig.modResults;
    if (language === "java") {
      throw new Error("RAW View expects a Kotlin MainApplication for the RawDecoder bridge.");
    }
    modConfig.modResults.contents = registerRawDecoderPackage(modConfig.modResults.contents, language);
    return modConfig;
  });

  config = withDangerousMod(config, ["android", async (modConfig) => {
    const sourceDirectory = path.join(
      modConfig.modRequest.platformProjectRoot,
      "app",
      "src",
      "main",
      "java",
      "com",
      "rawview",
      "rawdecoder",
    );
    await fs.promises.mkdir(sourceDirectory, { recursive: true });
    await Promise.all([
      fs.promises.writeFile(path.join(sourceDirectory, "RawDecoderModule.kt"), rawDecoderModule),
      fs.promises.writeFile(path.join(sourceDirectory, "RawDecoderPackage.kt"), rawDecoderPackage),
    ]);
    return modConfig;
  }]);

  return config;
}

module.exports = createRunOncePlugin(withRawDecoder, "rawview-libraw-decoder", "1.0.1");
