# RAW View

> 一款面向 Android 的本地相机照片查看与管理工具，支持导入、预览、重命名和导出常见相机 RAW 与图片文件。

RAW View 将用户导入的文件复制到**应用私有本地图库**中管理。这样的设计避免依赖不同文件提供方的改名能力：即使原文件所在的系统文件提供方不支持改名，应用内副本仍可被可靠重命名并导出。

## 功能概览

| 能力       | 说明                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------ |
| 文件导入   | 从 Android 系统文件选择器导入受支持文件，并建立应用本地副本。                              |
| 格式筛选   | 按全部、RAW、JPG / PNG 筛选本地图库。                                                      |
| 图片预览   | 支持 PNG、JPG、JPEG 的直接预览；RAW 文件通过原生 LibRaw 桥接生成本地 PNG 预览缓存。        |
| 安全重命名 | 固定保留扩展名、自动清理非法字符、避免名称冲突，并校验本地副本是否真正改名。               |
| 同步状态   | 改名后明确显示“已改本地副本 / 原文件未改”或“已改本地副本和原文件”。                        |
| 文件夹导出 | 通过 Android 系统文件夹选择器，将本地副本导出到用户指定目录。                              |
| 全屏浏览   | 点击图片进入全屏，支持双指缩放、单指拖动、双击在 100% 与 200% 间切换，以及“适应屏幕”复位。 |
| EXIF 信息  | 在详情页按需读取相机、镜头、拍摄时间、焦距、光圈、快门、ISO、像素尺寸与方向。              |
| 导航体验   | 文件详情支持返回按钮与左侧边缘右滑返回文件库。                                             |

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

在详情页点击“查看 EXIF 信息”即可按需读取应用本地副本。对于包含标准 EXIF 的 JPG、JPEG、PNG，界面会展示可用的相机、镜头、拍摄时间和曝光参数；没有嵌入元数据的文件会明确提示。Sony ARW、Canon CR2 / CR3、Nikon NEF 与 Panasonic RW2 仍可使用现有 RAW 预览功能，但当前版本会提示厂商 RAW 元数据尚未直接解析。

## 项目结构

```text
app/
  (tabs)/index.tsx           # 文件库、筛选与导入入口
  detail.tsx                 # 独立文件详情、改名、导出与预览
components/
  zoomable-image.tsx         # 全屏缩放图片组件
lib/
  photo-library.ts           # 本地图库、导入、持久化、改名与导出流程
  local-file-bridge.ts       # TypeScript 到 Android 原生文件桥接
  exif-info.ts               # EXIF 数据模型、原生调用与展示格式化
  raw-files.ts               # 支持格式、文件模型与名称清洗
  raw-preview.ts             # RAW 预览调用层
plugins/
  with-raw-decoder.js        # Expo 配置插件：LibRaw 与 Android 原生模块
tests/
  raw-files.test.ts          # 格式识别与文件名规则测试
  exif-info.test.ts          # EXIF 展示格式化测试
```

## 质量检查

在提交前可运行以下检查：

```bash
pnpm test
pnpm check
pnpm lint
npx expo config --json
```

当前发布版本为 **1.0.9**，Android `versionCode` 为 **10**。

## 自动构建与 GitHub Release

仓库包含 Android Release 构建工作流。推送形如 `v1.0.8` 的 Git tag，或从 GitHub Actions 手动运行 **Android Release APK** 工作流，会执行干净的 Android 预构建、生成已签名 APK、校验签名，并将产物上传到对应的 GitHub Release。

工作流使用仓库的加密机密变量保存签名材料，密钥文件不会写入 Git 历史。发布前请确认 `app.config.ts` 中的 `version` 与 Android `versionCode` 已按需更新；同一应用包名的新版本必须使用同一签名密钥，才能覆盖安装已发布版本。[3]

## 当前限制

| 项目       | 说明                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------- |
| 平台       | RAW 解码、可写文档选择与指定文件夹导出目前面向 Android 原生构建。                         |
| Expo Go    | 不包含自定义 LibRaw / 文件管理原生模块，因此无法验证 RAW 预览、应用副本改名与文件夹导出。 |
| 原文件改名 | Android 文件提供方可能返回“不支持改名”；这不会阻止应用本地副本改名。                      |
| RAW 预览   | 是否能成功解码由源文件、相机编码变体、设备可用内存和 LibRaw 支持情况共同决定。            |
| RAW EXIF   | 厂商 RAW 元数据当前不做直接解析，详情页会显示可操作的降级提示。                           |

## 参考资料

[1] [Expo：FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)

[2] [LibRaw 官方网站](https://www.libraw.org/)

[3] [Android Developers：应用签名](https://developer.android.com/studio/publish/app-signing)
