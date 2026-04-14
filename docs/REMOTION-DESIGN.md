# Remotion 视频生成组件设计方案

## 一、现有 Pipeline

```
用户选择 style + aspectRatio + videoStyle
         ↓
内容 → PPT Generator → HTML + 02-outline.md
         ↓
Remotion 渲染 → 输出视频 + 字幕
         ↓
/public/output/{date}/{html文件名}/
├── 7cc21f60.html
├── 7cc21f60.mp4
└── 7cc21f60.srt
```

### 尺寸对应关系

| aspectRatio | 视频尺寸 |
|-------------|---------|
| 16:9 | 1920 × 1080 |
| 9:16 | 1080 × 1920 |

> 视频尺寸直接沿用 PPT 的 aspectRatio，不需要额外选择。

### 首页新增选项

需要在 `app/page.tsx` 的生成面板中新增 **视频风格** 选择：

| 选项 | 语速 | 气口 | 适用场景 |
|------|------|------|---------|
| 普通（默认） | 5 字/秒 | 1.2s | 科普、教学 |
| 快节奏 | 7 字/秒 | 1.0s | 搞笑、资讯 |
| 慢速 | 3 字/秒 | 1.5s | 催眠、读书、冥想 |

---

## 二、项目结构（按任务隔离）

每个任务独立一个目录，任务 ID 即文件夹名（如 `7cc21f60`）：

```
/public/remotion/{任务ID}/
├── src/
│   ├── index.ts                    # 导出入口
│   ├── Video.tsx                   # 主视频组件
│   ├── SlideScene.tsx              # 单页场景（解析自 HTML）
│   ├── CaptionOverlay.tsx           # 字幕叠加层
│   ├── calculateMetadata.ts         # calculateMetadata 动态计算尺寸/时长
│   ├── generateSubtitles.ts         # 生成字幕时间轴（SRT）
│   ├── parseSlide.ts                # 解析 HTML 提取单页内容
│   ├── parseOutline.ts              # 解析 02-outline.md 提取旁白
│   └── styles/
│       └── theme.ts                 # 从 HTML 提取的 CSS 变量（颜色/字体）
├── public/
│   └── fonts/                      # Manrope 字体（本地化）
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 三、需要新增的文件

| 文件 | 作用 |
|------|------|
| `/public/remotion/{任务ID}/src/Video.tsx` | 主组件，用 `calculateMetadata` 动态设置 dimensions/duration |
| `/public/remotion/{任务ID}/src/SlideScene.tsx` | 渲染单页 PPT 内容（背景/标题/要点） |
| `/public/remotion/{任务ID}/src/CaptionOverlay.tsx` | 字幕叠加，TikTok 风格 |
| `/public/remotion/{任务ID}/src/calculateMetadata.ts` | 从 HTML 读取 dimensions，计算总时长 |
| `/public/remotion/{任务ID}/src/generateSubtitles.ts` | 根据 videoStyle 计算字幕时间轴，返回 SRT |
| `/public/remotion/{任务ID}/src/parseSlide.ts` | 解析 HTML 的 `<section class="slide">` 提取内容 |
| `/public/remotion/{任务ID}/src/parseOutline.ts` | 解析 02-outline.md 的 `### 旁白` 字段 |
| `/public/remotion/{任务ID}/src/styles/theme.ts` | 提取 HTML 中 `:root` 的 CSS 变量 |
| `/public/remotion/{任务ID}/package.json` | remotion 依赖 |
| `/public/remotion/{任务ID}/vite.config.ts` | remotion 配置 |

---

## 四、需要修改的文件

| 文件 | 修改内容 |
|------|---------|
| `app/page.tsx` | 新增视频风格选择器（普通/快节奏/慢速） |
| `lib/pipeline/index.ts` | HTML 生成时直接创建 `/public/output/{date}/{html文件名}/` 目录 |
| `lib/style-presets.ts` | 可选：新增 `videoStyle` 字段到预设中 |

---

## 五、Remotion Skill 调用方式

### 阶段一：写代码前

读取 remotion skill 获取规则：

| 规则文件 | 用途 |
|---------|------|
| `compositions.md` | 如何定义 `<Composition>` |
| `calculate-metadata.md` | 动态计算 dimensions/duration |
| `sequencing.md` | 多场景顺序播放 |
| `display-captions.md` | 字幕展示（TikTok 风格） |
| `transitions.md` | 场景切换动画 |
| `timing.md` | spring/easing 动画曲线 |
| `fonts.md` | Google Fonts 本地化 |

### 阶段二：写代码时

按照规则文件中的模板和示例编写代码。

### 阶段三：有问题时

再针对性读取某个规则文件。

---

## 六、核心 Props

```typescript
interface RemotionVideoProps {
  dimensions: { width: number; height: number };
  videoStyle: 'normal' | 'fast' | 'slow';
  pptHtmlPath: string;   // 如 '/output/2026-04-14/7cc21f60/7cc21f60.html'
  outlinePath: string;    // 如 '/.claude-pipeline/7cc21f60/02-outline.md'
}
```

### Props 来源

| Prop | 来源 |
|------|------|
| `dimensions` | 根据 `aspectRatio` 计算：16:9→1920×1080, 9:16→1080×1920 |
| `videoStyle` | 用户在首页选择 |
| `pptHtmlPath` | Pipeline 生成后传入 |
| `outlinePath` | Pipeline 生成后传入 |

---

## 七、视频风格参数

| 风格 | 语速 | 气口 |
|------|------|------|
| `normal` | 5 字/秒 | 1.2s |
| `fast` | 7 字/秒 | 1.0s |
| `slow` | 3 字/秒 | 1.5s |

---

## 八、字幕时间轴计算

根据 VIDEO-DESIGN.md 经验：

```typescript
function calculateSubtitles(paragraphs: string[], style: VideoStyle) {
  const { wordsPerSecond, gap } = STYLE_PARAMS[style];

  return paragraphs.map((text, i) => {
    const duration = text.length / wordsPerSecond;
    const start = i === 0 ? 0 : subtitles[i-1].end + gap;
    const end = start + duration;
    return { text, start, end };
  });
}
```

---

## 九、输出文件

```
/public/output/{date}/{html文件名}/
├── 7cc21f60.mp4       # 渲染的视频
├── 7cc21f60.srt      # 字幕时间轴（供剪映自动朗读）
└── 7cc21f60.html     # PPT HTML（生成时直接写入）
```

### 多版本输出

如需重新渲染，文件名加版本号：

```
├── 7cc21f60_v1.mp4
├── 7cc21f60_v1.srt
├── 7cc21f60_v2.mp4
└── 7cc21f60_v2.srt
```

---

## 十、Remotion 工作流

```
1. 写代码（调用 remotion skill）
   └── 创建 Video.tsx, SlideScene.tsx 等组件

2. 预览（本地调试）
   └── cd /public/remotion/{任务ID} && npx remotion preview

3. 渲染（生成视频）
   └── cd /public/remotion/{任务ID} && npx remotion render PPT-Video --out=...
```

### Pipeline 集成调用方式

推荐 CLI 方式，用 `child_process.exec` 调用：

```typescript
// 手动触发渲染
const taskId = '7cc21f60';
exec(`cd /public/remotion/${taskId} && npx remotion render PPT-Video --out=${outputDir}`);
```

---

## 十一、错误处理

| 错误类型 | 处理方式 |
|---------|---------|
| HTML 解析失败 | 报告错误，终止渲染 |
| 字体加载失败 | 使用 fallback 字体，继续渲染 |
| 渲染失败 | 报告错误，显示错误日志 |
| 渲染超时 | 后期增加超时检测和重试机制 |

---

## 十三、Remotion 项目初始化

项目名称统一使用任务 ID（如 `7cc21f60`）。

`npx create-video@latest` 的交互选项预设：

| 选项 | 预设值 |
|------|--------|
| 项目名称 | `{任务ID}` |
| 包管理器 | npm |
| TypeScript | yes |

---

## 十四、UI 参考

首页视频风格选择器参考现有风格/尺寸选择器的实现：
- 用**按钮组**（类似 `ratio` 按钮组）
- 位于生成按钮附近，与尺寸选择并排或在其下方

```tsx
// 参考现有实现
<div className="video-style-group">
  {VIDEO_STYLES.map(s => (
    <button
      key={s.id}
      className={`vstyle ${videoStyle === s.id ? "vstyle--on" : ""}`}
      onClick={() => setVideoStyle(s.id)}
    >
      {s.name}
    </button>
  ))}
</div>
```

---

## 十五、重新生成

**本期不实现。** 后续考虑。

---

## 十六、其他

- Remotion 项目初始化预设：项目名=任务ID，npm，TypeScript
- 错误处理：报告错误 + 后期加重试机制
- 字体：Manrope 本地化到 `/public/remotion/{任务ID}/public/fonts/`
