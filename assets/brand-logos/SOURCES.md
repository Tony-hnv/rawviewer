# 品牌 Logo 来源记录

| 品牌 | 资源来源 | 当前状态 |
| --- | --- | --- |
| Sony、Nikon、Fujifilm、Leica、Panasonic、Apple、Samsung、Google、Huawei、Xiaomi、OPPO、vivo | [Simple Icons](https://github.com/simple-icons/simple-icons) 的公开单色 SVG | 使用构建脚本转换为透明 PNG 白色遮罩。 |
| Canon | [Wikimedia Commons 的 Canon Logo SVG](https://upload.wikimedia.org/wikipedia/commons/8/8d/Canon_logo.svg) | 使用构建脚本转换为透明 PNG 白色遮罩。 |
| Hasselblad | [Wikimedia Commons 的 Hasselblad Logo SVG](https://upload.wikimedia.org/wikipedia/commons/6/6b/Hasselblad_Logo.svg) | 使用构建脚本转换为透明 PNG 白色遮罩。 |

以上商标均归各自权利人所有。RAW View 仅将其用于用户选择品牌信息的识别展示，不表示关联、授权或背书。

验证记录：已运行 Android Expo 预构建，并确认 14 个 Logo PNG 均复制到 `drawable-nodpi`，原生绘制按 Logo 的原始宽高比缩放。资源使用透明白色遮罩；界面与导出的边框再以当前主题前景色着色，因此在深色与浅色主题均保持可见。

视觉核验记录：已在深色背景上检查 14 个本地资源。Sony、Canon、Nikon、Fujifilm、Leica、Hasselblad、Panasonic、Apple、Samsung、Google、Huawei、Xiaomi、OPPO 与 vivo 均显示为各自真实的字标或图形商标，未出现旧的相机/手机类别图形或单字母徽章；所有 Logo 以等比方式放入各自显示区域。
