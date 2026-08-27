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
const EXIF_DEPENDENCY = 'implementation("androidx.exifinterface:exifinterface:1.3.7")';

const rawDecoderModule = `package com.rawview.rawdecoder

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import androidx.exifinterface.media.ExifInterface
import com.facebook.react.bridge.ActivityEventListener
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
  private val pickerRequestCode = 7317
  private val exportRequestCode = 7318
  private var documentPickerPromise: Promise? = null
  private var exportPromise: Promise? = null
  private var exportLocalUri: String? = null
  private var exportFileName: String? = null

  private val documentPickerListener = object : ActivityEventListener {
    override fun onNewIntent(intent: Intent) = Unit

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode == exportRequestCode) {
        val promise = exportPromise ?: return
        exportPromise = null
        val localUri = exportLocalUri
        val fileName = exportFileName
        exportLocalUri = null
        exportFileName = null
        if (resultCode != Activity.RESULT_OK || data?.data == null || localUri == null || fileName == null) {
          promise.resolve(null)
          return
        }
        try {
          val treeUri = data.data!!
          persistUriPermission(treeUri)
          val parentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri))
          val outputUri = requireNotNull(DocumentsContract.createDocument(appContext.contentResolver, parentUri, "application/octet-stream", fileName)) {
            "EXPORT_CREATE_FAILED: The selected folder did not allow creating the file."
          }
          val localFile = File(requireNotNull(Uri.parse(localUri).path) { "Local file path is unavailable." })
          check(localFile.exists()) { "EXPORT_SOURCE_MISSING: The local copy is no longer available." }
          localFile.inputStream().use { input ->
            requireNotNull(appContext.contentResolver.openOutputStream(outputUri, "w")) { "EXPORT_WRITE_FAILED: Cannot write to selected folder." }.use { output -> input.copyTo(output) }
          }
          promise.resolve(outputUri.toString())
        } catch (error: Exception) {
          promise.reject("EXPORT_FAILED", error.message ?: "Unable to export local copy.", error)
        }
        return
      }
      if (requestCode != pickerRequestCode) return
      val promise = documentPickerPromise ?: return
      documentPickerPromise = null
      if (resultCode != Activity.RESULT_OK || data == null) {
        promise.resolve(Arguments.createArray())
        return
      }
      try {
        val uris = buildList {
          data.clipData?.let { clip -> for (index in 0 until clip.itemCount) add(clip.getItemAt(index).uri) }
          data.data?.let { add(it) }
        }.distinct()
        val assets = Arguments.createArray()
        for (uri in uris) {
          persistUriPermission(uri)
          var displayName = "untitled"
          var fileSize = 0L
          appContext.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
              cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 }?.let { displayName = cursor.getString(it) ?: displayName }
              cursor.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 }?.let { fileSize = cursor.getLong(it) }
            }
          }
          assets.pushMap(Arguments.createMap().apply {
            putString("name", displayName)
            putString("uri", uri.toString())
            putDouble("size", fileSize.toDouble())
          })
        }
        promise.resolve(assets)
      } catch (error: Exception) {
        promise.reject("WRITABLE_PICK_FAILED", error.message ?: "Unable to read selected files.", error)
      }
    }
  }

  init {
    appContext.addActivityEventListener(documentPickerListener)
  }

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

  private fun isRawFile(file: File): Boolean = file.extension.lowercase() in setOf("arw", "cr2", "cr3", "nef", "rw2")

  private fun formatExifDate(value: String?): String? {
    if (value.isNullOrBlank()) return null
    if (value.length < 10 || value[4] != ':' || value[7] != ':') return value
    return value.substring(0, 4) + "-" + value.substring(5, 7) + "-" + value.substring(8)
  }

  @ReactMethod
  fun readExif(localUri: String, promise: Promise) {
    try {
      val localFile = File(requireNotNull(Uri.parse(localUri).path) { "Local file path is unavailable." })
      check(localFile.exists()) { "EXIF_SOURCE_MISSING: The local copy is no longer available." }
      if (isRawFile(localFile)) {
        promise.resolve(Arguments.createMap().apply {
          putString("status", "unsupported")
          putString("message", "当前版本可预览此 RAW 文件，但其厂商元数据暂不支持直接读取。")
        })
        return
      }

      val exif = ExifInterface(localFile.absolutePath)
      val result = Arguments.createMap()
      var fieldCount = 0
      fun putText(key: String, value: String?) {
        val cleanValue = value?.trim()?.takeIf { it.isNotEmpty() } ?: return
        result.putString(key, cleanValue)
        fieldCount += 1
      }
      fun putNumber(key: String, value: Double) {
        if (value <= 0.0) return
        result.putDouble(key, value)
        fieldCount += 1
      }
      fun putInteger(key: String, value: Int) {
        if (value <= 0) return
        result.putInt(key, value)
        fieldCount += 1
      }

      putText("make", exif.getAttribute(ExifInterface.TAG_MAKE))
      putText("model", exif.getAttribute(ExifInterface.TAG_MODEL))
      putText("lensModel", exif.getAttribute(ExifInterface.TAG_LENS_MODEL))
      putText("dateTime", formatExifDate(exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL) ?: exif.getAttribute(ExifInterface.TAG_DATETIME)))
      putNumber("focalLength", exif.getAttributeDouble(ExifInterface.TAG_FOCAL_LENGTH, 0.0))
      putNumber("aperture", exif.getAttributeDouble(ExifInterface.TAG_F_NUMBER, 0.0))
      putText("exposureTime", exif.getAttribute(ExifInterface.TAG_EXPOSURE_TIME)?.let { "$it s" })
      putInteger("iso", exif.getAttributeInt(ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY, exif.getAttributeInt(ExifInterface.TAG_ISO_SPEED_RATINGS, 0)))
      putInteger("width", exif.getAttributeInt(ExifInterface.TAG_PIXEL_X_DIMENSION, exif.getAttributeInt(ExifInterface.TAG_IMAGE_WIDTH, 0)))
      putInteger("height", exif.getAttributeInt(ExifInterface.TAG_PIXEL_Y_DIMENSION, exif.getAttributeInt(ExifInterface.TAG_IMAGE_LENGTH, 0)))
      putInteger("orientation", exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, 0))

      if (fieldCount > 0) {
        result.putString("status", "available")
        result.putString("message", "已读取可用的 EXIF 与图像信息。")
      } else {
        result.putString("status", "unavailable")
        result.putString("message", "此文件未包含可读取的 EXIF 信息。")
      }
      promise.resolve(result)
    } catch (_: Exception) {
      promise.resolve(Arguments.createMap().apply {
        putString("status", "unavailable")
        putString("message", "无法读取此文件的 EXIF 信息。")
      })
    }
  }

  @ReactMethod
  fun pickWritableDocuments(promise: Promise) {
    try {
      check(documentPickerPromise == null) { "A document selection is already active." }
      val activity = appContext.currentActivity ?: throw IllegalStateException("No Android activity is available for file selection.")
      documentPickerPromise = promise
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
      }
      activity.startActivityForResult(intent, pickerRequestCode)
    } catch (error: Exception) {
      documentPickerPromise = null
      promise.reject("WRITABLE_PICK_FAILED", error.message ?: "Unable to open the writable file selector.", error)
    }
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
      val renamed = localFile.renameTo(renamedLocalFile)
      if (!renamed) {
        localFile.inputStream().use { input -> renamedLocalFile.outputStream().use { output -> input.copyTo(output) } }
        check(renamedLocalFile.exists() && renamedLocalFile.length() == localFile.length()) { "LOCAL_RENAME_FAILED: Android could not create a verified local copy." }
        check(localFile.delete()) { "LOCAL_RENAME_FAILED: Android could not remove the old local copy." }
      }
      check(renamedLocalFile.exists() && renamedLocalFile.name == newFileName) { "LOCAL_RENAME_FAILED: The local copy name did not update." }

      var resolvedSourceUri = sourceUri
      var sourceRenamed = false
      var sourceRenameError: String? = null
      if (!sourceUri.isNullOrBlank()) {
        try {
          val source = Uri.parse(sourceUri)
          persistUriPermission(source)
          when (source.scheme) {
            "content" -> {
              val renamedSource = DocumentsContract.renameDocument(appContext.contentResolver, source, newFileName)
              if (renamedSource != null) {
                resolvedSourceUri = renamedSource.toString()
                sourceRenamed = true
              } else {
                sourceRenameError = "原文件提供方不支持改名；已仅更新应用本地副本。"
              }
            }
            "file" -> {
              val sourceFile = File(requireNotNull(source.path))
              if (sourceFile.canonicalPath == localFile.canonicalPath) {
                resolvedSourceUri = "file://" + renamedLocalFile.absolutePath
                sourceRenamed = true
              } else {
                val renamedSourceFile = File(requireNotNull(sourceFile.parentFile), newFileName)
                sourceRenamed = sourceFile.renameTo(renamedSourceFile)
                if (sourceRenamed) resolvedSourceUri = "file://" + renamedSourceFile.absolutePath else sourceRenameError = "Android 未允许同步改名原文件；已仅更新应用本地副本。"
              }
            }
            else -> sourceRenameError = "原文件 URI 不支持改名；已仅更新应用本地副本。"
          }
        } catch (error: Exception) {
          sourceRenameError = error.message ?: "原文件提供方不支持改名；已仅更新应用本地副本。"
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

  @ReactMethod
  fun exportLibraryFile(localUri: String, fileName: String, promise: Promise) {
    try {
      check(exportPromise == null) { "An export folder selection is already active." }
      val activity = appContext.currentActivity ?: throw IllegalStateException("No Android activity is available for folder selection.")
      exportPromise = promise
      exportLocalUri = localUri
      exportFileName = fileName
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
      }
      activity.startActivityForResult(intent, exportRequestCode)
    } catch (error: Exception) {
      exportPromise = null
      exportLocalUri = null
      exportFileName = null
      promise.reject("EXPORT_PICK_FAILED", error.message ?: "Unable to open folder selector.", error)
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
  const dependencies = [LIBRAW_DEPENDENCY, EXIF_DEPENDENCY].filter(
    (dependency) => !contents.includes(dependency),
  );
  if (dependencies.length === 0) return contents;
  return contents.replace(
    /dependencies\s*\{/,
    (match) => `${match}\n    ${dependencies.join("\n    ")}`,
  );
}

function addReleaseSigningConfiguration(contents) {
  if (contents.includes("RAWVIEW_RELEASE_SIGNING")) return contents;

  const releaseSigningProperties = `// RAWVIEW_RELEASE_SIGNING: loaded only when a CI or local release keystore is provided.
def rawViewKeystorePropertiesFile = rootProject.file("keystore.properties")
def rawViewKeystoreProperties = new Properties()
if (rawViewKeystorePropertiesFile.exists()) {
    rawViewKeystorePropertiesFile.withInputStream { rawViewKeystoreProperties.load(it) }
}

`;
  let updated = contents.replace(/android\s*\{/, (match) => `${releaseSigningProperties}${match}`);

  updated = updated.replace(
    /(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s*\}\s*)(\n\s*\})/,
    `$1
        release {
            if (rawViewKeystorePropertiesFile.exists()) {
                storeFile file(rawViewKeystoreProperties["storeFile"])
                storePassword rawViewKeystoreProperties["storePassword"]
                keyAlias rawViewKeystoreProperties["keyAlias"]
                keyPassword rawViewKeystoreProperties["keyPassword"]
            }
        }$2`,
  );

  return updated.replace(
    /signingConfig signingConfigs\.debug\n(\s*def enableShrinkResources)/,
    `signingConfig rawViewKeystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug
            $1`,
  );
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
    modConfig.modResults.contents = addReleaseSigningConfiguration(
      addNativeDependency(modConfig.modResults.contents),
    );
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

module.exports = createRunOncePlugin(withRawDecoder, "rawview-libraw-decoder", "1.0.6");
