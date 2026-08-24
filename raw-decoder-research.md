# 安卓 RAW 解码方案调研记录

## 结论

实际预览需要在 Android 原生层将相机 RAW 转换为可显示的位图或 PNG/JPEG 缓存文件。现有 Expo 图像组件不能直接承担跨品牌 RAW 解码。本轮实现将引入 Android 原生 RAW 转码模块，并由应用在需要预览时调用转码方法，再将产出的 PNG 文件交给现有图像组件显示。

| 方案 | 格式覆盖 | 集成判断 |
| --- | --- | --- |
| `react-native-raw-image` | 项目说明称已测试 `.nef`、`.rw2`、`.cr2`、`.arw`，仅 Android | 可作为当前应用的原生转码入口；需要自定义 Android 构建，不能在 Expo Go 中运行 |
| LibRaw | 官方说明可读取 CR2、NEF 等几乎所有相机 RAW，并服务于 RAW 转换器等嵌入式程序 | 作为稳定的底层解码基础；CR3 兼容性应以具体相机型号与底层库版本为准 |

## 实施约束

用户设备需安装由项目发布流程生成的 Android 构建，而非 Expo Go。解码流程会在首次打开 RAW 文件时生成并缓存 PNG；若原生模块或具体相机格式无法解码，界面保留明确错误说明与文件信息，而非误导性空白预览。

候选 `react-native-raw-image` 的 Android 构建文件包含 React Native 新架构分支和 Glide 依赖，但项目本身已归档，且构建脚本仍引用较旧的 Android Gradle Plugin。因此，直接接入该库存在与 Expo SDK 54 / React Native 0.81 原生构建不兼容的风险。实现将先以可选原生模块方式接入，并在缺失模块时明确报告“需要安卓原生构建”；真实 RAW 转换仅在发布后的 Android 构建中启用。

进一步调研发现，AndroidLibRaw 以 LibRaw 为底层，声明能够解码实际 RAW 数据而非仅读取嵌入 JPEG，并支持现代 Android 文件权限模型；其限制是 API 24+、NDK/CMake 原生编译及 JitPack 构建仓库。该库更符合跨相机 RAW 解码的目标。本轮将其封装为项目内 Kotlin React Native 原生桥接模块，并在 Android 预构建时引入 JitPack 与 AndroidLibRaw 依赖。

AndroidLibRaw 的公开 API 包含 `decodeBitmap(String file, BitmapFactory.Options options)` 与 `decodeBitmap(int fd, BitmapFactory.Options options)`，可以从文件路径或文件描述符直接生成 Android `Bitmap`。这为项目原生桥接提供了明确的实现路径：Kotlin 模块接收已导入的本地文件 URI，调用 `decodeBitmap`，将输出压缩为应用缓存目录中的 PNG，再把 URI 返回给 React Native。

## 参考

[1] [react-native-raw-image repository](https://github.com/ehsanbigzad/react-native-raw-image)

[2] [LibRaw documentation](https://www.libraw.org/docs)
