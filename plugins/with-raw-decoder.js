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
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.net.Uri
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

  private fun createEncodablePreview(decodedBitmap: Bitmap): Bitmap {
    val sourceBitmap = if (decodedBitmap.config == Bitmap.Config.HARDWARE) {
      decodedBitmap.copy(Bitmap.Config.ARGB_8888, false)
        ?: throw IllegalStateException("Unable to copy RAW bitmap for preview encoding.")
    } else {
      decodedBitmap
    }

    try {
      val maxPreviewEdge = 1600
      val longestEdge = maxOf(sourceBitmap.width, sourceBitmap.height)
      val scale = minOf(1f, maxPreviewEdge.toFloat() / longestEdge.toFloat())
      val targetWidth = (sourceBitmap.width * scale).roundToInt().coerceAtLeast(1)
      val targetHeight = (sourceBitmap.height * scale).roundToInt().coerceAtLeast(1)
      val softwarePreview = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(softwarePreview)
      val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
      canvas.drawBitmap(sourceBitmap, null, Rect(0, 0, targetWidth, targetHeight), paint)
      return softwarePreview
    } finally {
      if (sourceBitmap !== decodedBitmap) {
        sourceBitmap.recycle()
      }
    }
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

      val options = BitmapFactory.Options().apply {
        inPreferredConfig = Bitmap.Config.ARGB_8888
      }
      val decodedBitmap = LibRaw().use { decoder ->
        decoder.decodeBitmap(sourceFile.absolutePath, options)
      }
      val previewBitmap = createEncodablePreview(decodedBitmap)
      val outputFile = File(appContext.cacheDir, "raw-preview-\${UUID.randomUUID()}.png")
      val temporaryFile = File(appContext.cacheDir, "raw-preview-\${UUID.randomUUID()}.tmp")
      try {
        FileOutputStream(temporaryFile).use { stream ->
          check(previewBitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) { "RAW_PREVIEW_WRITE_FAILED: PNG encoding returned false." }
        }
        check(temporaryFile.length() > 0L) { "RAW_PREVIEW_WRITE_FAILED: PNG output is empty." }
        check(temporaryFile.renameTo(outputFile)) { "RAW_PREVIEW_WRITE_FAILED: Unable to finalize preview cache." }
      } finally {
        if (temporaryFile.exists()) temporaryFile.delete()
        if (previewBitmap !== decodedBitmap) {
          previewBitmap.recycle()
        }
      }
      promise.resolve("file://\${outputFile.absolutePath}")
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

module.exports = createRunOncePlugin(withRawDecoder, "rawview-libraw-decoder", "1.0.0");
