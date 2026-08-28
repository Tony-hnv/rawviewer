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
const LIBRAW_DEPENDENCY =
  'implementation("com.github.dburckh:AndroidLibRaw:2.0.7")';
const EXIF_DEPENDENCY =
  'implementation("androidx.exifinterface:exifinterface:1.3.7")';
const METADATA_EXTRACTOR_DEPENDENCY =
  'implementation("com.drewnoakes:metadata-extractor:2.21.0")';

const rawDecoderModule = `package com.rawview.rawdecoder

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.graphics.Rect
import android.graphics.RectF
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import androidx.exifinterface.media.ExifInterface
import com.drew.imaging.ImageMetadataReader
import com.drew.metadata.Metadata
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
import kotlin.math.max
import kotlin.math.min
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

  private fun imageOrientation(file: File): Int = try {
    ExifInterface(file.absolutePath).getAttributeInt(
      ExifInterface.TAG_ORIENTATION,
      ExifInterface.ORIENTATION_NORMAL,
    )
  } catch (_: Exception) {
    ExifInterface.ORIENTATION_NORMAL
  }

  private fun orientationMatrix(orientation: Int): Matrix = Matrix().apply {
    when (orientation) {
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> postScale(-1f, 1f)
      ExifInterface.ORIENTATION_ROTATE_180 -> postRotate(180f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> postScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> {
        postRotate(90f)
        postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_ROTATE_90 -> postRotate(90f)
      ExifInterface.ORIENTATION_TRANSVERSE -> {
        postRotate(-90f)
        postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_ROTATE_270 -> postRotate(270f)
    }
  }

  private fun uprightImageSize(file: File): Pair<Int, Int> {
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, options)
    val width = options.outWidth
    val height = options.outHeight
    check(width > 0 && height > 0) { "IMAGE_DIMENSIONS_UNAVAILABLE: Cannot decode image dimensions." }
    return when (imageOrientation(file)) {
      ExifInterface.ORIENTATION_TRANSPOSE,
      ExifInterface.ORIENTATION_ROTATE_90,
      ExifInterface.ORIENTATION_TRANSVERSE,
      ExifInterface.ORIENTATION_ROTATE_270 -> Pair(height, width)
      else -> Pair(width, height)
    }
  }

  private fun decodeUprightBitmap(file: File): Bitmap {
    val decoded = requireNotNull(BitmapFactory.decodeFile(file.absolutePath)) {
      "IMAGE_DECODE_FAILED: Cannot decode the selected image."
    }
    val orientation = imageOrientation(file)
    if (orientation == ExifInterface.ORIENTATION_NORMAL || orientation == ExifInterface.ORIENTATION_UNDEFINED) {
      return decoded
    }
    return try {
      Bitmap.createBitmap(
        decoded,
        0,
        0,
        decoded.width,
        decoded.height,
        orientationMatrix(orientation),
        true,
      ).also { upright ->
        if (upright !== decoded) decoded.recycle()
      }
    } catch (error: Exception) {
      decoded.recycle()
      throw error
    }
  }

  @ReactMethod
  fun getCropImageInfo(localUri: String, promise: Promise) {
    try {
      val file = File(requireNotNull(Uri.parse(localUri).path) { "Local file path is unavailable." })
      check(file.exists()) { "CROP_SOURCE_MISSING: Import the file again before cropping." }
      val (width, height) = uprightImageSize(file)
      promise.resolve(Arguments.createMap().apply {
        putInt("width", width)
        putInt("height", height)
        putInt("orientation", imageOrientation(file))
      })
    } catch (error: Exception) {
      promise.reject("CROP_INFO_FAILED", error.message ?: "Unable to read crop image dimensions.", error)
    }
  }

  @ReactMethod
  fun cropImage(
    localUri: String,
    originX: Double,
    originY: Double,
    width: Double,
    height: Double,
    destinationUri: String,
    format: String,
    promise: Promise,
  ) {
    var uprightBitmap: Bitmap? = null
    var croppedBitmap: Bitmap? = null
    try {
      val sourceFile = File(requireNotNull(Uri.parse(localUri).path) { "Local file path is unavailable." })
      check(sourceFile.exists()) { "CROP_SOURCE_MISSING: Import the file again before cropping." }
      val upright = decodeUprightBitmap(sourceFile)
      uprightBitmap = upright
      val sourceWidth = upright.width
      val sourceHeight = upright.height
      val left = originX.roundToInt().coerceIn(0, sourceWidth - 1)
      val top = originY.roundToInt().coerceIn(0, sourceHeight - 1)
      val cropWidth = width.roundToInt().coerceIn(1, sourceWidth - left)
      val cropHeight = height.roundToInt().coerceIn(1, sourceHeight - top)
      val cropped = Bitmap.createBitmap(upright, left, top, cropWidth, cropHeight)
      croppedBitmap = cropped

      val destinationFile = File(requireNotNull(Uri.parse(destinationUri).path) { "Destination path is unavailable." })
      destinationFile.parentFile?.mkdirs()
      val compressFormat = if (format == "png") Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG
      destinationFile.outputStream().use { output ->
        check(cropped.compress(compressFormat, 100, output)) { "CROP_WRITE_FAILED: Android could not encode the cropped image." }
      }
      check(destinationFile.exists() && destinationFile.length() > 0L) { "CROP_WRITE_FAILED: Cropped local copy is empty." }
      promise.resolve(Arguments.createMap().apply {
        putString("uri", "file://" + destinationFile.absolutePath)
        putInt("width", cropWidth)
        putInt("height", cropHeight)
      })
    } catch (error: Exception) {
      promise.reject("CROP_FAILED", error.message ?: "Unable to crop image into the local library.", error)
    } finally {
      croppedBitmap?.recycle()
      uprightBitmap?.recycle()
    }
  }

  private fun frameColor(value: String, fallback: Int): Int = try {
    Color.parseColor(value)
  } catch (_: IllegalArgumentException) {
    fallback
  }

  private fun drawFrameText(
    canvas: Canvas,
    text: String,
    x: Float,
    y: Float,
    size: Float,
    color: Int,
    bold: Boolean = false,
  ) {
    if (text.isBlank()) return
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      this.color = color
      textSize = size
      typeface = if (bold) android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
      isSubpixelText = true
    }
    canvas.drawText(text, x, y, paint)
  }

  private fun drawBrandLogo(
    canvas: Canvas,
    brandMark: String,
    left: Float,
    top: Float,
    width: Float,
    height: Float,
    foreground: Int,
  ) {
    if (brandMark.isBlank()) return
    val resourceName = when (brandMark) {
      "Sony" -> "rawview_logo_sony"
      "Canon" -> "rawview_logo_canon"
      "Nikon" -> "rawview_logo_nikon"
      "Fujifilm" -> "rawview_logo_fujifilm"
      "Leica" -> "rawview_logo_leica"
      "Hasselblad" -> "rawview_logo_hasselblad"
      "Panasonic" -> "rawview_logo_panasonic"
      "Apple" -> "rawview_logo_apple"
      "Samsung" -> "rawview_logo_samsung"
      "Google" -> "rawview_logo_google"
      "Huawei" -> "rawview_logo_huawei"
      "Xiaomi" -> "rawview_logo_xiaomi"
      "OPPO" -> "rawview_logo_oppo"
      "vivo" -> "rawview_logo_vivo"
      else -> return
    }
    val resourceId = appContext.resources.getIdentifier(resourceName, "drawable", appContext.packageName)
    if (resourceId == 0) return
    val logo = BitmapFactory.decodeResource(appContext.resources, resourceId) ?: return
    try {
      val scale = min(width / logo.width.toFloat(), height / logo.height.toFloat())
      val drawWidth = logo.width * scale
      val drawHeight = logo.height * scale
      val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
        colorFilter = PorterDuffColorFilter(foreground, PorterDuff.Mode.SRC_IN)
      }
      canvas.drawBitmap(
        logo,
        null,
        RectF(left + (width - drawWidth) / 2f, top + (height - drawHeight) / 2f, left + (width + drawWidth) / 2f, top + (height + drawHeight) / 2f),
        paint,
      )
    } finally {
      logo.recycle()
    }
  }

  private fun drawFilmPerforations(
    canvas: Canvas,
    outputWidth: Int,
    outputHeight: Int,
    sideInset: Int,
    foreground: Int,
  ) {
    val holeSize = max(5f, sideInset * 0.34f)
    val gap = max(4f, holeSize * 0.62f)
    val count = max(4, min(16, ((outputWidth - sideInset * 2) / (holeSize + gap)).roundToInt()))
    val span = count * holeSize + (count - 1) * gap
    val startX = (outputWidth - span) / 2f
    val holePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = foreground
      alpha = 170
      style = Paint.Style.FILL
    }
    for (index in 0 until count) {
      val left = startX + index * (holeSize + gap)
      canvas.drawRoundRect(left, sideInset * 0.25f, left + holeSize, sideInset * 0.25f + holeSize, holeSize * 0.18f, holeSize * 0.18f, holePaint)
      val bottomTop = outputHeight - sideInset * 0.25f - holeSize
      canvas.drawRoundRect(left, bottomTop, left + holeSize, bottomTop + holeSize, holeSize * 0.18f, holeSize * 0.18f, holePaint)
    }
  }

  @ReactMethod
  fun createPhotoFrame(
    localUri: String,
    destinationUri: String,
    format: String,
    style: String,
    backgroundColor: String,
    foregroundColor: String,
    title: String,
    subtitle: String,
    details: String,
    brandMark: String,
    logoVisible: Boolean,
    logoScale: Double,
    logoOffsetX: Double,
    logoOffsetY: Double,
    promise: Promise,
  ) {
    var uprightBitmap: Bitmap? = null
    var framedBitmap: Bitmap? = null
    try {
      val sourceFile = File(requireNotNull(Uri.parse(localUri).path) { "Local file path is unavailable." })
      check(sourceFile.exists()) { "FRAME_SOURCE_MISSING: Import the file again before adding a frame." }
      val upright = decodeUprightBitmap(sourceFile)
      uprightBitmap = upright
      val shortSide = min(upright.width, upright.height)
      val sideRatio = if (style == "film") 0.068f else if (style == "polaroid") 0.062f else 0.052f
      val sideInset = max(28, (shortSide * sideRatio).roundToInt())
      val informationStyle = style == "exif" || style == "brand" || style == "polaroid"
      val filmStyle = style == "film"
      val roundedStyle = style == "rounded" || style == "polaroid"
      val bottomInset = when {
        style == "polaroid" -> max(sideInset * 4, (shortSide * 0.24f).roundToInt())
        informationStyle -> max(sideInset * 3, (shortSide * 0.17f).roundToInt())
        else -> sideInset
      }
      val outputWidth = upright.width + sideInset * 2
      val outputHeight = upright.height + sideInset + bottomInset
      val output = Bitmap.createBitmap(outputWidth, outputHeight, Bitmap.Config.ARGB_8888)
      framedBitmap = output
      val canvas = Canvas(output)
      val background = frameColor(backgroundColor, Color.WHITE)
      val foreground = frameColor(foregroundColor, Color.BLACK)
      canvas.drawColor(background)
      // The canvas is sized from the decoded upright bitmap. Draw it at its
      // native size, so the left, right and top margins are exactly sideInset.
      // The information panel is extra height below the image and never
      // participates in image scaling or containment.
      val drawLeft = sideInset
      val drawTop = sideInset
      val drawWidth = upright.width
      val drawHeight = upright.height
      check(drawLeft + drawWidth + sideInset == outputWidth) { "FRAME_LAYOUT_FAILED: Horizontal frame margins are not equal." }
      check(drawTop == sideInset) { "FRAME_LAYOUT_FAILED: Top frame margin is invalid." }
      val bitmapPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
      if (roundedStyle) {
        val radius = max(12f, shortSide * 0.022f)
        val clipPath = Path().apply {
          addRoundRect(
            RectF(
              drawLeft.toFloat(),
              drawTop.toFloat(),
              (drawLeft + drawWidth).toFloat(),
              (drawTop + drawHeight).toFloat(),
            ),
            radius,
            radius,
            Path.Direction.CW,
          )
        }
        canvas.save()
        canvas.clipPath(clipPath)
        canvas.drawBitmap(upright, drawLeft.toFloat(), drawTop.toFloat(), bitmapPaint)
        canvas.restore()
      } else {
        canvas.drawBitmap(upright, drawLeft.toFloat(), drawTop.toFloat(), bitmapPaint)
      }

      if (filmStyle) {
        drawFilmPerforations(canvas, outputWidth, outputHeight, sideInset, foreground)
        drawFrameText(
          canvas,
          if (details.isBlank()) "RAW VIEW" else details,
          sideInset.toFloat(),
          outputHeight - max(6f, sideInset * 0.18f),
          max(10f, min(22f, shortSide * 0.018f)),
          foreground,
          bold = true,
        )
      }

      if (informationStyle) {
        val textX = sideInset.toFloat()
        val captionTop = (sideInset + upright.height).toFloat()
        val titleSize = max(18f, min(44f, shortSide * if (style == "brand") 0.045f else 0.031f))
        val subtitleSize = max(11f, min(25f, shortSide * 0.018f))
        val detailSize = max(10f, min(22f, shortSide * 0.015f))
        val titleY = captionTop + bottomInset * if (style == "polaroid") 0.46f else 0.34f
        val subtitleY = captionTop + bottomInset * if (style == "polaroid") 0.66f else 0.56f
        val detailY = captionTop + bottomInset * if (style == "polaroid") 0.84f else 0.78f
        drawFrameText(canvas, title, textX, titleY, titleSize, foreground, bold = true)
        drawFrameText(canvas, subtitle, textX, subtitleY, subtitleSize, foreground)
        drawFrameText(canvas, details, textX, detailY, detailSize, foreground, bold = true)
        if (style == "brand" && logoVisible) {
          val safeLogoScale = logoScale.toFloat().coerceIn(0.6f, 1.6f)
          val logoWidth = min(bottomInset * 0.92f, 180f) * safeLogoScale
          val logoHeight = min(bottomInset * 0.42f, 58f) * safeLogoScale
          val horizontalTravel = sideInset * 2f
          val verticalTravel = bottomInset * 0.28f
          val requestedLeft = outputWidth - sideInset - logoWidth + logoOffsetX.toFloat() * horizontalTravel
          val requestedTop = captionTop + (bottomInset - logoHeight) / 2f + logoOffsetY.toFloat() * verticalTravel
          val logoLeft = requestedLeft.coerceIn(sideInset.toFloat(), (outputWidth - sideInset - logoWidth).coerceAtLeast(sideInset.toFloat()))
          val logoTop = requestedTop.coerceIn(captionTop, (captionTop + bottomInset - logoHeight).coerceAtLeast(captionTop))
          drawBrandLogo(
            canvas,
            brandMark,
            logoLeft,
            logoTop,
            logoWidth,
            logoHeight,
            foreground,
          )
        }
      }

      val destinationFile = File(requireNotNull(Uri.parse(destinationUri).path) { "Destination path is unavailable." })
      destinationFile.parentFile?.mkdirs()
      val compressFormat = if (format == "png") Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG
      destinationFile.outputStream().use { outputStream ->
        check(output.compress(compressFormat, 100, outputStream)) { "FRAME_WRITE_FAILED: Android could not encode the bordered image." }
      }
      check(destinationFile.exists() && destinationFile.length() > 0L) { "FRAME_WRITE_FAILED: Framed local copy is empty." }
      promise.resolve(Arguments.createMap().apply {
        putString("uri", "file://" + destinationFile.absolutePath)
        putInt("width", outputWidth)
        putInt("height", outputHeight)
      })
    } catch (error: Exception) {
      promise.reject("FRAME_FAILED", error.message ?: "Unable to create the local framed copy.", error)
    } finally {
      framedBitmap?.recycle()
      uprightBitmap?.recycle()
    }
  }

  private fun isRawFile(file: File): Boolean = file.extension.lowercase() in setOf("arw", "cr2", "cr3", "nef", "rw2")

  private fun rawMetadataValue(metadata: Metadata, vararg tagNames: String): String? {
    for (directory in metadata.directories) {
      for (tag in directory.tags) {
        if (tag.tagName in tagNames) {
          val value = tag.description?.trim()
          if (!value.isNullOrEmpty()) return value
        }
      }
    }
    return null
  }

  private fun metadataNumber(value: String?): Double {
    val text = value?.trim() ?: return 0.0
    val fraction = Regex("""(-?\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)""").find(text)
    if (fraction != null) {
      val numerator = fraction.groupValues[1].toDoubleOrNull() ?: return 0.0
      val denominator = fraction.groupValues[2].toDoubleOrNull() ?: return 0.0
      if (denominator != 0.0) return numerator / denominator
    }
    return Regex("""-?\d+(?:\.\d+)?""").find(text)?.value?.toDoubleOrNull() ?: 0.0
  }

  private fun normalizedExposure(value: String?): String? {
    if (value.isNullOrBlank()) return null
    return value.replace(" seconds", " s").replace(" second", " s").replace(" sec", " s")
  }

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

      if (isRawFile(localFile)) {
        val metadata = ImageMetadataReader.readMetadata(localFile)
        putText("make", rawMetadataValue(metadata, "Make", "Camera Make"))
        putText("model", rawMetadataValue(metadata, "Model", "Camera Model"))
        putText("lensModel", rawMetadataValue(metadata, "Lens Model", "Lens Type", "Lens"))
        putText("dateTime", formatExifDate(rawMetadataValue(metadata, "Date/Time Original", "Date/Time", "Date Created")))
        putNumber("focalLength", metadataNumber(rawMetadataValue(metadata, "Focal Length", "Focal Length 35")))
        putNumber("aperture", metadataNumber(rawMetadataValue(metadata, "F-Number", "Aperture Value", "Max Aperture Value")))
        putText("exposureTime", normalizedExposure(rawMetadataValue(metadata, "Exposure Time", "Shutter Speed Value")))
        putInteger("iso", metadataNumber(rawMetadataValue(metadata, "ISO Speed Ratings", "Photographic Sensitivity", "ISO" )).roundToInt())
        putInteger("width", metadataNumber(rawMetadataValue(metadata, "Image Width", "Exif Image Width", "Raw Image Width" )).roundToInt())
        putInteger("height", metadataNumber(rawMetadataValue(metadata, "Image Height", "Exif Image Height", "Raw Image Height" )).roundToInt())
        putInteger("orientation", metadataNumber(rawMetadataValue(metadata, "Orientation" )).roundToInt())
        result.putString("metadataSource", "raw_vendor")
        if (fieldCount > 0) {
          result.putString("status", "available")
          result.putString("message", "已读取可用的厂商 RAW 元数据。")
        } else {
          result.putString("status", "unavailable")
          result.putString("message", "此 RAW 文件未包含可读取的厂商拍摄参数。")
        }
        promise.resolve(result)
        return
      }

      val exif = ExifInterface(localFile.absolutePath)

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
        result.putString("metadataSource", "standard_exif")
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
    return contents.replace(
      repositoriesBlock,
      (match) => `${match}\n        maven { url "https://jitpack.io" }`,
    );
  }
  return `${contents}\nallprojects { repositories { maven { url "https://jitpack.io" } } }\n`;
}

function addNativeDependency(contents) {
  const dependencies = [
    LIBRAW_DEPENDENCY,
    EXIF_DEPENDENCY,
    METADATA_EXTRACTOR_DEPENDENCY,
  ].filter((dependency) => !contents.includes(dependency));
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
  let updated = contents.replace(
    /android\s*\{/,
    (match) => `${releaseSigningProperties}${match}`,
  );

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
  const importStatement =
    language === "java"
      ? `import ${PACKAGE_IMPORT};`
      : `import ${PACKAGE_IMPORT}`;
  const withImport = contents.replace(
    /^(package\s+[^\n;]+;?)$/m,
    (match) => `${match}\n\n${importStatement}`,
  );

  if (language === "java") {
    return withImport.replace(
      /new PackageList\(this\)\.getPackages\(\)/,
      "new PackageList(this).getPackages() {{RAW_DECODER_REGISTRATION}}",
    );
  }

  const packageListPattern = /PackageList\(this\)\.packages\.apply\s*\{/;
  if (!packageListPattern.test(withImport)) {
    throw new Error(
      "Unable to register RawDecoderPackage in MainApplication.kt.",
    );
  }
  return withImport.replace(
    packageListPattern,
    (match) => `${match}\n          add(RawDecoderPackage())`,
  );
}

function withRawDecoder(config) {
  config = withGradleProperties(config, (modConfig) => {
    const safeBuildProperties = {
      "org.gradle.jvmargs":
        "-Xmx1280m -XX:MaxMetaspaceSize=512m -XX:ReservedCodeCacheSize=160m -Dfile.encoding=UTF-8",
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
    modConfig.modResults.contents = addJitPackRepository(
      modConfig.modResults.contents,
    );
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
      throw new Error(
        "RAW View expects a Kotlin MainApplication for the RawDecoder bridge.",
      );
    }
    modConfig.modResults.contents = registerRawDecoderPackage(
      modConfig.modResults.contents,
      language,
    );
    return modConfig;
  });

  config = withDangerousMod(config, [
    "android",
    async (modConfig) => {
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
      const logoSourceDirectory = path.join(
        modConfig.modRequest.projectRoot,
        "assets",
        "brand-logos",
      );
      const drawableDirectory = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "drawable-nodpi",
      );
      const brandLogoFiles = [
        "sony",
        "canon",
        "nikon",
        "fujifilm",
        "leica",
        "hasselblad",
        "panasonic",
        "apple",
        "samsung",
        "google",
        "huawei",
        "xiaomi",
        "oppo",
        "vivo",
      ];
      await fs.promises.mkdir(sourceDirectory, { recursive: true });
      await fs.promises.mkdir(drawableDirectory, { recursive: true });
      await Promise.all([
        fs.promises.writeFile(
          path.join(sourceDirectory, "RawDecoderModule.kt"),
          rawDecoderModule,
        ),
        fs.promises.writeFile(
          path.join(sourceDirectory, "RawDecoderPackage.kt"),
          rawDecoderPackage,
        ),
        ...brandLogoFiles.map((logoFile) =>
          fs.promises.copyFile(
            path.join(logoSourceDirectory, `${logoFile}.png`),
            path.join(drawableDirectory, `rawview_logo_${logoFile}.png`),
          ),
        ),
      ]);
      return modConfig;
    },
  ]);

  return config;
}

module.exports = createRunOncePlugin(
  withRawDecoder,
  "rawview-libraw-decoder",
  "1.0.8",
);
