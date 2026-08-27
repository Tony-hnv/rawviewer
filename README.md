# RAW View

> 一款面向 Android 的本地相机照片查看与管理工具，支持导入、预览、重命名和导出常见相机 RAW 与图片文件。

RAW View 将用户导入的文件复制到**应用私有本地图库**中管理。这样的设计避免依赖不同文件提供方的改名能力：即使原文件所在的系统文件提供方不支持改名，应用内副本仍可被可靠重命名并导出。

## 功能概览

| 能力         | 说明                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| 文件导入     | 从 Android 系统文件选择器导入受支持文件，并建立应用本地副本。                                                 |
| 格式筛选     | 按全部、RAW、JPG / PNG 筛选本地图库。                                                                         |
| 图片预览     | 支持 PNG、JPG、JPEG 的直接预览；RAW 文件通过原生 LibRaw 桥接生成本地 PNG 预览缓存。                           |
| 安全重命名   | 固定保留扩展名、自动清理非法字符、避免名称冲突，并校验本地副本是否真正改名。                                  |
| 同步状态     | 改名后明确显示“已改本地副本 / 原文件未改”或“已改本地副本和原文件”。                                           |
| 文件夹导出   | 通过 Android 系统文件夹选择器，将本地副本导出到用户指定目录。                                                 |
| 全屏浏览     | 点击图片进入全屏，支持双指缩放、单指拖动、双击在 100% 与 200% 间切换，以及“适应屏幕”复位。                    |
| EXIF 信息    | 读取标准与厂商 RAW 元数据，支持复制到剪贴板或通过系统分享为文本文件。                                         |
| 手动比例裁切 | 支持为 PNG、JPG、JPEG 选择 1:1、4:3、3:4、16:9 或 9:16 比例；可拖动裁切框位置、缩放框的尺寸，并保存为新副本。 |
| 选择并清除   | 长按图片进入单选/多选模式，可选择当前筛选中的全部或部分项目后，经二次确认清除应用本地副本。                   |
| 照片边框     | 为 PNG、JPG、JPEG 生成比例不变的上图下信息栏边框，支持纯色留白、EXIF 参数和带图标的相机/手机品牌标识。        |
| 导航体验     | 文件详情支持返回按钮与左侧边缘右滑返回文件库。                                                                |

## 支持格式

| 厂商或类别 | 格式                    | 应用内标记    |
| ---------- | ----------------------- | ------------- |
| Sony       | `.arw`                  | Sony RAW      |
| Canon      | `.cr2`、`.cr3`          | Canon RAW     |
| Nikon      | `.nef`                  | Nikon RAW     |
| Panasonic  | `.rw2`                  | Panasonic RAW |
| 常见图片   | `.png`、`.jpg`、`.jpeg` | Image         |

## 技术栈

项目基于 Expo SDK 54、React Native 0.81、React 19 和 TypeScript 构建。路由采用 Expo Router，手势采用 `react-native-gesture-handler` 与 Reanimated，本地图库元数据使用 AsyncStorage 保存。Android 原生模块借助 LibRaw 负责 RAW 解码，并用 Android Storage Access Framework 处理可写文档 URI 与用户选定目录导出。[1] [2]

## 快速开始

### 环境要求

开发 Android 原生功能需要 Node.js、pnpm、Android Studio（Android SDK）以及与 Expo / Gradle 配套的 Java 环境。RAW 解码、应用副本改名和指定文件夹导出均依赖原生 Android 构建，**不能在 Expo Go 中使用**。

### 安装与运行

```bash
git clone https://github.com/Tony-hnv/rawviewer.git
cd rawviewer
pnpm install

# 首次生成 Android 原生工程，或原生配置插件变更后执行
npx expo prebuild --platform android

# 连接 Android 设备或启动模拟器后运行
pnpm android
```

如需启动开发服务，可执行：

```bash
pnpm dev
```

## 使用说明

### 导入与预览

在文件库点击“导入文件”，从系统选择器中选择受支持的文件。导入完成后，RAW View 会先将内容复制进应用本地图库；PNG、JPG、JPEG 可直接预览，RAW 文件首次打开时会生成设备本地预览缓存。RAW 的实际兼容性还取决于相机型号、压缩方式和 LibRaw 的解码支持范围。[2]

### 重命名状态

重命名只编辑文件名主体，原扩展名会保留。应用会先保证**本地副本**已重命名并写入本地图库记录，然后再尽力同步原文件：

| 状态标签                    | 含义                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| `已改本地副本和原文件`      | 应用副本与原文件均已完成改名。                                   |
| `已改本地副本 / 原文件未改` | 本地副本已经成功改名，但原文件所在提供方不支持或未允许同步改名。 |
| `当前管理应用本地副本`      | 文件尚未在 RAW View 中改名，当前由应用本地图库管理。             |

### 导出本地副本

在详情页点击“导出副本”，在 Android 系统界面选择目标文件夹并确认。应用只会向用户明确授权的目录写入导出文件，不会尝试直接写入任意公共路径。

### 全屏缩放

点击预览图进入全屏模式。顶部会显示当前缩放比例；可用双指缩放、单指拖动查看局部，双击在 100% 与 200% 间切换，或点击“适应屏幕”回到 100%。

### EXIF 信息

在详情页点击“查看 EXIF 信息”即可按需读取应用本地副本。对于包含标准 EXIF 的 JPG、JPEG、PNG，界面会展示可用的相机、镜头、拍摄时间和曝光参数。对于 Sony ARW、Canon CR2、Nikon NEF 与 Panasonic RW2，应用会通过 Android 原生 metadata-extractor 读取可用的厂商拍摄参数并标记“厂商 RAW 元数据”。Canon CR3 与个别相机编码变体若未暴露标准标签，界面会明确提示而不会影响预览或导出。

EXIF 弹窗支持“复制”与“分享”。复制会将可见拍摄参数写入系统剪贴板；分享会在应用缓存中创建短文本文件并打开 Android 系统分享面板。

### 按比例裁切

在详情页点击“手动比例裁切”，选择 `1:1`、`4:3`、`3:4`、`16:9` 或 `9:16`。裁切画布会显示图片实际可见范围与初始居中裁切框：拖动裁切框选择位置，拖动右下角手柄调整大小，也可双指缩放裁切框。应用会把显示坐标换算为原图像素后再裁切，结果始终保存为**新的应用本地副本**，不会改动原图或原始导入文件。为保留 RAW 原始数据，裁切仅适用于 PNG、JPG 和 JPEG；RAW 文件会给出明确提示。

### 清除已导入图片

在文件库右上角点击“选择图片”图标，或长按任意文件卡片，即可进入多选模式。轻点卡片可单选或取消选择，“全选当前”只影响当前筛选结果；点击“删除”并完成二次确认后，仅会移除所选的 RAW View 本地副本与图库记录。该操作**不删除设备原始文件**；若个别应用副本暂时无法删除，其记录会保留并明确提示，以便后续安全重试。

### 照片边框

在 PNG、JPG 或 JPEG 详情页点击“照片边框”，可选择画廊白、暗房黑、象牙米或胶片灰配色，并在以下模板间切换：纯色留白、EXIF 参数和品牌标识。边框使用“上方原图、下方留白信息栏”的布局；图片会在可用区域内等比例适配，绝不拉伸变形。EXIF 参数模板会展示可读取的相机、镜头、光圈、快门、ISO 与焦距；品牌标识模板提供 Sony、Canon、Nikon、Fujifilm、Leica、Hasselblad、Panasonic、Apple、Samsung、Google、Huawei、Xiaomi、OPPO 与 vivo 等常见相机和手机品牌的分类图标、字母徽章与品牌字样。边框由 Android 本地模块渲染并写入**新的应用私有副本**，不会修改原图；RAW 文件仍保持只读保护。

## 项目结构

```text
app/
  (tabs)/index.tsx           # 文件库、筛选与导入入口
  detail.tsx                 # 独立文件详情、改名、导出与预览
components/
  zoomable-image.tsx         # 全屏缩放图片组件
  manual-cropper.tsx         # 手动拖动、缩放与比例锁定的裁切编辑器
  photo-frame-editor.tsx     # 纯色、EXIF 参数和品牌标识边框编辑器
lib/
  photo-library.ts           # 本地图库、导入、持久化、改名与导出流程
  local-file-bridge.ts       # TypeScript 到 Android 原生文件桥接
  exif-info.ts               # EXIF 数据模型、原生调用与展示格式化
  crop-math.ts               # 裁切框边界、缩放和显示坐标到原图像素的换算
  photo-crop.ts              # 图片裁切与新本地副本保存
  photo-frame.ts             # 照片边框参数、排版文案与新副本保存
  raw-files.ts               # 支持格式、文件模型与名称清洗
  raw-preview.ts             # RAW 预览调用层
plugins/
  with-raw-decoder.js        # Expo 配置插件：LibRaw 与 Android 原生模块
tests/
  raw-files.test.ts          # 格式识别与文件名规则测试
  exif-info.test.ts          # EXIF 展示格式化测试
  photo-crop.test.ts         # 居中与手动比例裁切几何计算测试
  photo-frame.test.ts        # 照片边框参数与 EXIF 排版测试
```

## 质量检查

在提交前可运行以下检查：

```bash
pnpm test
pnpm check
pnpm lint
npx expo config --json
```

当前开发版本为 **1.1.4**，Android `versionCode` 为 **15**。此版本支持单选、多选、当前筛选全选后安全清除本地副本；同时修复边框拉伸，改用保持比例的上图下信息栏布局，并为品牌模板添加相机/手机类别图标与字母徽章；尚未自动推送或发布新的 GitHub Release。

## 自动构建与 GitHub Release

仓库包含 Android Release 构建工作流。推送形如 `v1.0.8` 的 Git tag，或从 GitHub Actions 手动运行 **Android Release APK** 工作流，会执行干净的 Android 预构建、生成已签名 APK、校验签名，并将产物上传到对应的 GitHub Release。

工作流使用仓库的加密机密变量保存签名材料，密钥文件不会写入 Git 历史。发布前请确认 `app.config.ts` 中的 `version` 与 Android `versionCode` 已按需更新；同一应用包名的新版本必须使用同一签名密钥，才能覆盖安装已发布版本。[3]

## 当前限制

| 项目       | 说明                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| 平台       | RAW 解码、可写文档选择与指定文件夹导出目前面向 Android 原生构建。                                      |
| Expo Go    | 不包含自定义 LibRaw / 文件管理原生模块，因此无法验证 RAW 预览、应用副本改名与文件夹导出。              |
| 原文件改名 | Android 文件提供方可能返回“不支持改名”；这不会阻止应用本地副本改名。                                   |
| RAW 预览   | 是否能成功解码由源文件、相机编码变体、设备可用内存和 LibRaw 支持情况共同决定。                         |
| RAW EXIF   | ARW、CR2、NEF、RW2 的可用标签会被解析；CR3 与厂商编码变体的可读字段取决于文件实际标签。                |
| 比例裁切   | PNG、JPG、JPEG 支持在比例锁定下手动移动和缩放裁切框；裁切 RAW 需先导出或转换为普通图片。               |
| 照片边框   | 边框导出仅支持 PNG、JPG、JPEG，需使用 Android 原生构建；品牌模板显示品牌字样，不提供厂商官方矢量商标。 |
| 清除图库   | 删除仅作用于用户选中的应用私有副本和图库记录；不会删除设备原始文件或源文件 URI。                       |

## 参考资料

[1] [Expo：FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)

[2] [LibRaw 官方网站](https://www.libraw.org/)

[3] [Android Developers：应用签名](https://developer.android.com/studio/publish/app-signing)
