# RAW Viewer - 相机 RAW 图片工具
一个 Android 应用，用于预览、预处理和重命名相机 RAW 图片。

支持格式：
- **RAW**：Sony (ARW)、Fujifilm (RAF)、Canon (CR2/CR3)、Nikon (NEF) 等常见品牌
- **HEIF/HEIC**
- **JPG/JPEG**

## 功能
- 📂 浏览设备上的图片（系统相册 + 自定义文件夹）
- 🖼 **真·RAW 像素解码预览**（基于 libraw NDK，全像素解码）
- ✂️ 预处理：旋转、裁剪、调整亮度/对比度、导出 JPEG
- ✏️ 批量重命名（按 EXIF 拍摄时间/自定义模板）

---

## 目录结构
```
app/
├── src/main/
│   ├── java/com/example/rawviewer/     # Kotlin 源码
│   ├── cpp/                            # Native (libraw) 代码
│   ├── jniLibs/                        # 预编译 .so (见下方说明)
│   └── res/                            # 资源
├── build.gradle
libraw/                                 # libraw 源码 (可选, 如自行编译)
```

---

## 🚀 如何构建 APK

### 前置条件
- [Android Studio](https://developer.android.com/studio)（含 Android SDK）
- 或命令行: JDK 17+、Android SDK、Android SDK Build-Tools 34+
- 推荐在 **x86_64 或 Apple Silicon Mac** 上构建（LibRaw NDK 编译需耗时）

### 方法一：Android Studio（推荐）
1. 用 Android Studio 打开本项目根目录
2. 等待 Gradle 同步完成
3. 连接安卓手机（开启 USB 调试），点 Run ▶ 直接安装
4. 或菜单 Build → Build APK(s) → Build APK(s)，apk 生成于 `app/build/outputs/apk/debug/`

### 方法二：命令行
```bash
# 设置 Android SDK 路径(按需)
export ANDROID_HOME=$HOME/Android/Sdk

# 生成 Gradle Wrapper（需本机装了 gradle，或用 Android Studio 打开自动生成）
gradle wrapper --gradle-version 8.7

# 直接构建
./gradlew assembleDebug

# 产物位置
# app/build/outputs/apk/debug/app-debug.apk
```

> 说明：仓库未包含二进制 `gradle-wrapper.jar`（无法在纯文本仓库提交）。
> 用 **Android Studio 打开会自动生成 wrapper**；命令行用户先执行一次
> `gradle wrapper`（或本机已有 gradle 时直接 `gradle assembleDebug`）。
> `gradle/wrapper/gradle-wrapper.properties` 已配置为 Gradle 8.7。

### 关于 libraw 原生库（重要）
本工程原生解码依赖 **LibRaw**。有两个选项：

**选项 A（推荐，免编译）**：下载预编译的 `libraw.so`（ARM64）放入
`app/src/main/jniLibs/arm64-v8a/`。可从 LibRaw 官方或第三方镜像获取。

**选项 B（自行编译 LibRaw NDK 库）**：参考 `docs/BUILD_LIBRAW.md`
（需要 NDK，编译 `raw-identify`/`simple_dcraw` 工具并集成）。

> 注：为保持仓库可独立构建，我默认按选项 A 提供。若你希望我协助把
> LibRaw 完整源码 + CMake 编译脚本一并集成，我可以继续补充（会增加首次构建时间）。

---

## 技术栈
- Kotlin + Jetpack Compose (Material 3)
- Coroutines + ViewModel
- ExifInterface (EXIF 读取)
- libraw (原生 RAW 解码, JNI 封装)

## License
个人学习/使用示例工程。
