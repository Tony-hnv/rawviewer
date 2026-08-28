# RAW View

<p align="center">
  <strong>面向 Android 摄影工作流的本地 RAW 与照片查看器</strong><br />
  导入、预览、管理、重命名、裁切与安全导出，不改动设备原始文件。
</p>

<p align="center">
  <a href="https://github.com/Tony-hnv/rawviewer/actions/workflows/android-release.yml"><img src="https://github.com/Tony-hnv/rawviewer/actions/workflows/android-release.yml/badge.svg?branch=main" alt="Android Release CI" /></a>
  <a href="https://github.com/Tony-hnv/rawviewer/releases/tag/v1.1.7"><img src="https://img.shields.io/github/v/release/Tony-hnv/rawviewer?label=release" alt="Latest release" /></a>
</p>

> **RAW View 的核心原则**：应用只管理导入后的本地副本。重命名、裁切、照片边框和导出都会生成或操作应用私有目录中的副本；设备上的原始文件不会被覆盖，也不会因清除图库而删除。

## 产品定位

RAW View 是一款以本地优先为设计重点的 Android 照片工具。它通过 Android 系统文件选择器导入相机 RAW 与常见图片，在应用私有图库中建立可追踪的副本，并提供适合摄影整理场景的预览、元数据查看、重命名、筛选、裁切、边框合成和文件夹导出能力。

应用不要求用户先上传云端，也不依赖原文件提供方必须支持改名。对于 Sony、Canon、Nikon 和 Panasonic 相机文件，RAW 预览与厂商元数据读取由 Android 原生模块完成；普通图片则直接使用本地图片管线处理。[1] [2]

## 支持格式

| 来源类别      | 扩展名                  | 主要能力                                    |
| ------------- | ----------------------- | ------------------------------------------- |
| Sony RAW      | `.arw`                  | RAW 预览、重命名、EXIF 与厂商元数据查看     |
| Canon RAW     | `.cr2`、`.cr3`          | RAW 预览、重命名、EXIF 与可用厂商元数据查看 |
| Nikon RAW     | `.nef`                  | RAW 预览、重命名、EXIF 与厂商元数据查看     |
| Panasonic RAW | `.rw2`                  | RAW 预览、重命名、EXIF 与厂商元数据查看     |
| 常见图片      | `.png`、`.jpg`、`.jpeg` | 预览、重命名、裁切、照片边框与导出          |

> RAW 的实际解码结果仍取决于相机型号、压缩方式、文件编码变体、设备内存和 LibRaw 支持范围。应用会对暂不支持的 RAW 元数据或预览情况给出明确提示。[2]

## 功能矩阵

| 模块       | 能力                                                      | 安全与行为说明                         |
| ---------- | --------------------------------------------------------- | -------------------------------------- |
| 本地图库   | 导入、持久化、按全部 / RAW / JPG-PNG 筛选                 | 导入内容复制到应用私有目录             |
| 文件管理   | 安全重命名、状态标签、单选 / 多选清除、当前筛选全选       | 扩展名保留；清除不删除设备原文件       |
| 图片预览   | PNG、JPG、JPEG 直接预览；RAW 原生解码预览                 | 支持详情页与全屏查看                   |
| 全屏查看   | 双指缩放、单指拖动、双击切换、显示缩放比例                | “适应屏幕”可快速复位                   |
| EXIF       | 相机、镜头、时间、光圈、快门、ISO、焦距及可用厂商字段     | 支持复制到剪贴板和系统分享             |
| 手动裁切   | `1:1`、`4:3`、`3:4`、`16:9`、`9:16`；拖动位置并缩放选区   | 仅对 PNG、JPG、JPEG 生成新副本         |
| 照片边框   | 纯色留白、画廊圆角、胶片日期、拍立得、EXIF 参数、品牌标识 | 保持原图比例；上、左、右边框等宽       |
| 文件夹导出 | 导出本地副本到用户选定的 Android 文件夹                   | 通过 Storage Access Framework 获取授权 |
| 导航       | 详情页返回按钮与左侧边缘右滑返回                          | 遵循 Android 返回行为                  |

## 照片边框与品牌 Logo

照片边框适用于 PNG、JPG 和 JPEG。所有边框使用原图像素尺寸布局，图片区域按比例绘制，底部信息栏独立向下增加高度，因此不会通过拉伸图片来填充边框。可用主题包括**画廊白、暗房黑、象牙米和胶片灰**。

| 模板      | 视觉效果             | 主要内容                          |
| --------- | -------------------- | --------------------------------- |
| 纯色留白  | 三边等宽的简洁留白   | 纯色画廊边框                      |
| 画廊圆角  | 图片角部圆角处理     | 保持图片比例与独立底栏            |
| 胶片日期  | 上下齿孔与日期戳     | 文件名和拍摄日期信息              |
| 拍立得    | 圆角图片与加高底栏   | 标题、日期和拍摄信息              |
| EXIF 参数 | 摄影参数信息栏       | 相机、镜头、光圈、快门、ISO、焦距 |
| 品牌标识  | 品牌 Logo 与品牌名称 | 相机和手机品牌识别信息            |

品牌标识模板使用可辨识的单色透明品牌 Logo，而不是相机 / 手机类别图形或首字母徽章。目前覆盖 **Sony、Canon、Nikon、Fujifilm、Leica、Hasselblad、Panasonic、Apple、Samsung、Google、Huawei、Xiaomi、OPPO、vivo**。Logo 仅用于用户选择品牌信息时的识别展示，不表示 RAW View 与相关商标权利人存在关联、授权或背书。资源来源与维护说明见 [`assets/brand-logos/SOURCES.md`](assets/brand-logos/SOURCES.md)。

## 安全副本模型

```text
设备原始文件
      │ Android 系统文件选择器导入
      ▼
RAW View 应用私有目录 raw-view-library/
      │
      ├── 重命名：更新应用副本与图库记录
      ├── 裁切：生成新的 PNG/JPG/JPEG 副本
      ├── 边框：生成新的 PNG/JPG/JPEG 副本
      └── 导出：复制到用户明确授权的目标文件夹
```

> **不会发生的操作**：应用不会覆盖设备原始文件；图库清除不会删除设备原始文件；RAW 不会被直接裁切或添加边框。

## 使用流程

### 导入与预览

在文件库点击“导入文件”，使用 Android 系统选择器选择受支持的 RAW、PNG 或 JPG 文件。导入完成后，应用会创建本地副本并将其加入图库。点击卡片可打开详情页，再点击预览图可进入全屏查看。

### 重命名与导出

详情页中的重命名只修改文件名主体并保留原扩展名。应用优先确保本地副本完成重命名；如果原文件提供方不支持同步改名，界面会显示“已改本地副本 / 原文件未改”。点击“导出副本”后，在系统文件夹选择器中确认目标目录即可。

### EXIF 与厂商元数据

在详情页打开 EXIF 面板，可查看普通图片的标准 EXIF，以及 ARW、CR2、CR3、NEF、RW2 中可读取的厂商拍摄字段。面板支持复制可见信息和通过 Android 系统分享为文本文件。没有可读取字段时，应用会显示降级提示而不是填充虚构数据。

### 手动比例裁切

选择比例后，拖动裁切框调整位置，拖动右下角手柄或使用双指手势调整选区大小。应用会将显示坐标换算到经过 EXIF 方向归一化的原图像素坐标，再写入新的应用私有副本。原图与原始导入文件保持不变。

### 清除图库

点击工具栏的选择入口或长按文件卡片进入选择模式。可逐项选择、取消选择，或使用“全选当前”选择当前筛选结果。完成二次确认后，应用只删除所选的 RAW View 私有副本与图库记录；删除失败的记录会保留并提示重试。

## 技术架构

RAW View 使用 Expo SDK 54 与 React Native 构建，采用 Expo Router 管理页面，AsyncStorage 保存本地图库索引，Android 原生 Kotlin 模块负责 RAW 解码、EXIF / 厂商元数据、EXIF 方向归一化裁切和照片边框合成。品牌 Logo 以离线透明 PNG 资源打包，在 React Native 编辑器和 Android 原生导出模块中共用稳定的品牌映射。

| 层级       | 关键文件                                                             | 职责                                   |
| ---------- | -------------------------------------------------------------------- | -------------------------------------- |
| 页面       | `app/(tabs)/index.tsx`、`app/detail.tsx`                             | 文件库、筛选、详情、管理操作           |
| 编辑器     | `components/manual-cropper.tsx`、`components/photo-frame-editor.tsx` | 手动裁切与边框选择预览                 |
| 本地业务   | `lib/photo-library.ts`、`lib/photo-crop.ts`、`lib/photo-frame.ts`    | 副本、图库索引、裁切与边框保存         |
| 原生桥接   | `lib/local-file-bridge.ts`、`plugins/with-raw-decoder.js`            | SAF、RAW、EXIF、原生图片处理           |
| 几何与映射 | `lib/crop-math.ts`、`lib/photo-frame-math.ts`、`lib/brand-logo.ts`   | 坐标、比例、版式与品牌 Logo 资源映射   |
| 测试       | `tests/*.test.ts`                                                    | RAW 文件模型、EXIF、裁切和边框回归测试 |

## 开发环境与运行

### 环境要求

开发 Android 原生功能需要 Node.js、pnpm、Android Studio、Android SDK 以及与 Expo / Gradle 兼容的 Java 环境。RAW 解码、应用私有副本处理和 Android 文件夹导出依赖原生工程，不能通过 Expo Go 完成验证。

### 安装与运行

```bash
git clone https://github.com/Tony-hnv/rawviewer.git
cd rawviewer
pnpm install

# 首次生成 Android 原生工程，或修改原生配置插件后执行
npx expo prebuild --platform android

# 连接 Android 设备或启动模拟器
pnpm android
```

启动开发服务：

```bash
pnpm dev
```

### 常用检查

```bash
pnpm test
pnpm check
pnpm lint
pnpm exec prettier --check .
npx expo config --json
```

## 签名构建与 Release

仓库中的 [Android Release 工作流](.github/workflows/android-release.yml) 支持两种触发方式：推送形如 `v1.1.7` 的 Git tag，或在 GitHub Actions 中手动运行 **Android Release APK** 并传入 `tag`。工作流会执行干净的 Expo Android 预构建、恢复 GitHub Secrets 中的签名配置、运行 Gradle Release 编译、使用 `apksigner` 校验 APK，并将签名 APK 上传到对应的 GitHub Release 和 Actions Artifact。

同一个 Android 包名的后续版本必须继续使用同一套签名密钥，才能覆盖安装已发布版本。签名材料只保存在仓库加密 Secrets 中，不应写入 Git 历史。[3]

## v1.1.7 Release

**v1.1.7** 已于 2026 年 8 月 28 日发布。本版本将品牌标识模板升级为 14 个可辨识的品牌 Logo，并让品牌选择器、编辑器预览与 Android 本地导出使用同一套离线资源；同时保持照片比例、三边等宽、底栏独立加高和应用私有新副本保护。

| 项目                | 内容                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| GitHub Release      | [RAW View v1.1.7](https://github.com/Tony-hnv/rawviewer/releases/tag/v1.1.7)                            |
| APK 下载            | [RAW-View-1.1.7.apk](https://github.com/Tony-hnv/rawviewer/releases/download/v1.1.7/RAW-View-1.1.7.apk) |
| APK 大小            | 54,481,117 bytes                                                                                        |
| SHA-256             | `537148a341abf036fb8adeceda33f72628205009393c5f184f47e3809d6501eb`                                      |
| GitHub main 提交    | `c5b296d0b2be565f7f866106648a284957390746`                                                              |
| Actions 运行        | [33134778318](https://github.com/Tony-hnv/rawviewer/actions/runs/33134778318)                           |
| Android versionCode | `18`                                                                                                    |

> 安装 APK 后建议优先在真实 Android 设备上验证：品牌 Logo 在浅色 / 深色主题下的清晰度、品牌边框导出后的新副本是否进入图库，以及原图是否保持不变。

## 当前限制

| 项目       | 当前状态                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| 平台       | RAW 解码、可写文档选择和文件夹导出目前面向 Android 原生构建。                                                           |
| Expo Go    | 不包含自定义 LibRaw 与文件管理原生模块，不能用于完整功能验收。                                                          |
| 原文件改名 | 文件提供方可能拒绝同步改名，但不影响应用私有副本改名。                                                                  |
| RAW 预览   | 兼容性由源文件编码、设备内存与 LibRaw 支持范围共同决定。                                                                |
| RAW EXIF   | 可读取字段取决于文件实际标签；CR3 和部分厂商变体可能只提供部分信息。                                                    |
| 裁切与边框 | 当前仅对 PNG、JPG、JPEG 生成新副本；RAW 保持只读。                                                                      |
| 真机验收   | 当前 CI 已完成签名构建与 `apksigner` 校验，仍需在真实 Android 设备端到端验证导入、RAW、EXIF、裁切、边框和选择删除流程。 |

## 参考资料

[1] [Expo Documentation](https://docs.expo.dev/)

[2] [LibRaw 官方网站](https://www.libraw.org/)

[3] [Android Developers：应用签名](https://developer.android.com/studio/publish/app-signing)

## 许可与商标说明

本仓库当前未附独立 `LICENSE` 文件；如需在仓库外分发或二次使用代码，请先确认项目所有者的授权范围。Sony、Canon、Nikon、Fujifilm、Leica、Hasselblad、Panasonic、Apple、Samsung、Google、Huawei、Xiaomi、OPPO、vivo 等名称与 Logo 均归各自权利人所有。RAW View 仅将其作为用户选择品牌信息时的识别元素，不主张拥有相关商标权利，也不暗示任何商业关联或官方背书。
