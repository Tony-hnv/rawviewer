# 构建 LibRaw 原生库（避免下载预编译 .so 时使用）

本工程的真·RAW 解码依赖 [LibRaw](https://www.libraw.org/)。有两个集成方式：

## 选项 A：使用预编译 .so（推荐，最快）
1. 获取 `librawlite.so`（ARM64/ARM32）。
   - 可自行编译（见下），或从社区预编译包提取。
2. 将文件放到：
   ```
   app/src/main/jniLibs/arm64-v8a/librawlite.so
   app/src/main/jniLibs/armeabi-v7a/librawlite.so
   ```
3. 直接 `./gradlew assembleDebug` 即可，无需 CMake。

> 说明：App 在运行时 `System.loadLibrary("rawlite")`，若 .so 缺失会
> 自动降级为 JPEG 内嵌预览（仍可用，只是不是全像素解码）。

## 选项 B：用 CMake 编译 LibRaw
1. 下载 LibRaw 源码到工程根目录 `libraw/`：
   ```bash
   cd rawviewer
   git clone https://github.com/LibRaw/LibRaw.git libraw
   ```
2. 在 `app/build.gradle` 的 `android{}` 中加入：
   ```groovy
   defaultConfig {
       externalNativeBuild {
           cmake { cppFlags "-O2" }
       }
   }
   externalNativeBuild {
       cmake { path "src/main/cpp/CMakeLists.txt" }  // 需要先开启 CMake 目标
   }
   ```
3. ``./gradlew assembleDebug`

注意事项：
- LibRaw 需要较新 NDK（r25+）。
- 编译一次需数分钟，且包体积会增加（~5-10MB/架构）。
- Arm32 与 Arm64 都建议编译，以兼容不同机型。
