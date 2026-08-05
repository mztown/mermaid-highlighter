# Mermaid Highlighter

将 mermaid 文本渲染为可缩放、可交互高亮 SVG 的即插即用（Plug-and-Play）模块。
支持 Node 与浏览器双环境，带 TypeScript 类型声明。

![demo](https://mztown.github.io/highlighting.svg)

![action demo](https://mztown.github.io/MHdisplay.gif)

## 效果展示

在线预览本模块的能力与页面效果：

- [在线编辑器](https://mztown.github.io/editor) —— 左侧输入 mermaid 文本、右侧实时渲染的可视化编辑器
- [展示板](https://mztown.github.io/displayBoard) —— 图表展示/展板页

## 安装

```bash
npm install mermaid-highlighter
# 若在 Node.js（服务端）环境使用，需额外安装 jsdom：
npm install jsdom
```

> 已通过 `exports` 提供 CommonJS / ESM / TypeScript 多入口，`import` 与 `require`
> 均可直接使用。

## 用法

### Node.js（服务端）

```js
const { renderMermaid } = require('mermaid-highlighter');
// 或：import { renderMermaid } from 'mermaid-highlighter';

(async () => {
  const svg = await renderMermaid('graph TD;\n  A-->B;\n  B-->C;');
  console.log(svg); // 完整 SVG 字符串
})();
```

### 浏览器（即插即用）

任意 HTML 页面只需引入模块（mermaid 会由模块自行动态加载），传入一个 DOM
容器和 mermaid 文本即可渲染出可缩放、可交互高亮的图表。

> **注意**：npm 发布包**不含** `vendor/` 目录，因此浏览器（非打包）方式必须通过
> `options.mermaidUrl` 指定一个可用的 mermaid 构建地址（如 CDN）。

#### 方式一：CDN 直接引入（最简单）

```html
<!-- 只需引入本模块，mermaid 通过 mermaidUrl 由 CDN 自动加载 -->
<script src="https://unpkg.com/mermaid-highlighter@1.0.1/index.js"></script>
<div id="container" style="width: 600px; height: 400px;"></div>
<script>
  const diagram = MermaidHighlighter.renderToContainer(
    document.getElementById('container'),
    'graph TD;\n  A --> B;\n  B --> C;',
    { mermaidUrl: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js' }
  );
  // 缩放 / 高亮 / 配色 / 下载
  diagram.zoomIn();
  diagram.highlightNode('B');
  diagram.setTheme('dark');
  diagram.downloadSvg('diagram.svg');
</script>
```

> 全局对象名为 `MermaidHighlighter`。CDN 地址可用 unpkg 或 jsdelivr：
> - `https://unpkg.com/mermaid-highlighter@1.0.1/index.js`
> - `https://cdn.jsdelivr.net/npm/mermaid-highlighter@1.0.1/index.js`

#### 方式二：手动拷贝模块文件

将 `index.js`（可连同 `index.mjs`、`index.d.ts`）拷贝到你的项目目录，然后按普通
脚本引入；仍需通过 `mermaidUrl` 指定 mermaid 构建：

```html
<div id="container" style="width: 600px; height: 400px;"></div>
<script src="index.js"></script>
<script>
  MermaidHighlighter.renderToContainer(
    document.getElementById('container'),
    'graph TD;\n  A --> B;',
    { mermaidUrl: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js' }
  );
</script>
```

若希望完全离线，可先把 mermaid 构建放到本地（如 `vendor/mermaid.min.js`），
然后指定本地路径：`{ mermaidUrl: 'vendor/mermaid.min.js' }`。

#### 方式三：打包工具（webpack / vite / rollup）

使用打包工具时无需手动指定 `mermaidUrl`——模块会通过 `require('mermaid')`
自动从项目的 `node_modules` 解析 mermaid：

```js
import { renderToContainer } from 'mermaid-highlighter';

const diagram = renderToContainer(
  document.getElementById('container'),
  'graph TD;\n  A --> B;',
  { theme: 'business', enableScrollZoom: true }
);
```

### YAML front-matter 自动忽略

若 mermaid 文本开头带有三条横杠包围的 YAML 头部元信息（例如编辑器导出的 `id`），
渲染与高亮解析都会**自动忽略**这一段，无需手动删除：

```text
---
id: 5BE08626-8499-4DEC-8EC4-A383A9184D72
---
graph TD;
  A --> B;
```

### 自定义主题

`renderMermaid(text, options)` 的第二个参数会透传给 `mermaid.initialize`：

```js
const svg = await renderMermaid('graph TD;\n A-->B;', { theme: 'dark' });
```

## 环境支持

- **浏览器**：模块会**自行动态加载 mermaid**。打包工具方式默认从 `node_modules`
  解析（`require('mermaid')`）；CDN / 手动拷贝方式则必须通过 `options.mermaidUrl`
  指定构建地址（发布包不含 `vendor/`，默认路径仅适用于仓库内本地构建）。
  无需在 HTML 中单独引入 mermaid 脚本；直接使用传入容器对应的 DOM 渲染。
- **Node.js（服务端）**：自动通过 `jsdom` 创建 DOM 环境进行渲染（需安装 `jsdom`），
  渲染完成后会自动清理注入的全局对象，避免影响同进程内其他代码。

## API

### `renderMermaid(mermaidText, options?)`

- `mermaidText` `<string>`：mermaid 语法文本（必填，非空，否则抛出 `TypeError`）。
- `options` `<object>`：可选，mermaid 初始化配置；额外支持 `mermaidUrl` 指定浏览器端
  mermaid 构建的加载路径（打包工具方式默认自动解析 `mermaid`，CDN/手动拷贝方式需显式
  指定，见上文「浏览器（即插即用）」）。
- 返回：`<Promise<string>>` 渲染后的完整 SVG 字符串。
- 说明：mermaid v11 的 `render` 返回 `{ svg, diagramType, bindFunctions }` 对象，
  本方法已归一化为直接返回其中的 `svg` 字符串。

### `renderToContainer(container, mermaidText, options?)`（浏览器）

**直接用传入的 mermaid 文本渲染传入的 DOM**，生成一个可缩放、可交互高亮的 mermaid 图。
任意 HTML 页面**只需引入 `index.js`**（无需单独引入 mermaid）即可使用。

- `container` `<HTMLElement>`：目标容器元素，渲染结果直接写入该元素。
- `mermaidText` `<string>`：mermaid 文本。
- `options` `<object>`：可选配置，支持：
  - `theme`：配色方案 key（默认 `light`）
  - `mermaidUrl`：mermaid 构建加载路径（打包工具方式默认自动解析 `mermaid`；
    CDN/手动拷贝方式需显式指定，如 jsdelivr / unpkg 的 mermaid@11 地址）
  - `mermaid`：额外的 mermaid 初始化配置（会合并进主题配置）
  - `enableScrollZoom`：是否允许鼠标滚轮直接缩放（以指针位置为中心），默认 `true`；
    设为 `false` 可关闭
  - `autoTheme`：是否根据系统/浏览器深浅色模式自动切换深色/浅色主题，默认 `false`；
    设为 `true` 开启，系统模式变化时图表自动跟随（深色 ↔ 浅色）
  - `customThemes`：用户自定义配色方案，格式
    `{ [key]: { label, background, highlight, mermaid } }`，会合并进内置主题，
    可通过 `theme` / `setTheme(key)` 使用
  - `onZoomChange(level)`：缩放比例变化回调
  - `onRendered(svg)`：渲染完成回调
  - `onError(message)`：渲染出错回调
  - `onThemeChange(key)`：配色方案变化回调
- 返回：`<object>` 控制句柄，包含：
  - `render(text)` / `update(text)`：重新渲染
  - `getSvg()`：获取当前 SVG 元素
  - `getSvgString()`：获取当前 SVG 的字符串（含 XML 声明与命名空间）
  - `downloadSvg(filename?)`：下载当前 SVG 图像（默认文件名 `mermaid-diagram.svg`）
  - `zoomIn()` / `zoomOut()` / `resetZoom()` / `setZoom(level)` / `getZoom()`：缩放控制
  - `highlightNode(nodeId)` / `clearHighlight()`：点击高亮控制
  - `getTheme()` / `setTheme(key)` / `getThemes()`：配色方案控制
  - `destroy()`：销毁实例并清理内容

> 说明：`downloadSvg` 会先把当前高亮/变灰等状态固化为内联样式，再导出，
> 因此下载的 `.svg` 文件在任意查看器中都能正确显示完整图表。

#### 配色方案

内置三个默认配色方案，可通过 `theme` 选项或 `setTheme(key)` 切换：

| key | 名称 | 背景 | 元素 | 高亮 |
|-----|------|------|------|------|
| `light` | 浅色经典 | 白 | 黑/深灰 | 蓝 |
| `dark` | 深色经典 | 黑 | 白 | 红 |
| `business` | 商务蓝 | 浅蓝灰 | 深蓝边 | 青蓝 |

配色方案通过 mermaid 的 `themeVariables` 控制渲染主体配色，并同步更新画布背景与
节点高亮（`is-active` 发光）颜色。

**自定义配色方案**：通过 `customThemes` 传入自定义主题，会合并进内置主题，
可用 `theme` / `setTheme(key)` 使用：

```js
const diagram = MermaidHighlighter.renderToContainer(el, text, {
  customThemes: {
    ocean: {
      label: '海洋绿',
      background: '#f0fdf4',        // 容器背景
      highlight: '#16a34a',         // 高亮发光色
      mermaid: {                    // mermaid themeVariables 配置
        theme: 'base',
        themeVariables: {
          primaryColor: '#dcfce7',
          primaryTextColor: '#14532d',
          primaryBorderColor: '#16a34a',
        },
      },
    },
  },
  theme: 'ocean',                   // 直接使用自定义主题
});
```

浏览器用法示例（HTML 页面只需引入 `index.js`）：

```html
<div id="container" style="width: 600px; height: 400px;"></div>

<!-- 只需引入 index.js，mermaid 会被自动加载 -->
<script src="index.js"></script>
<script>
  // 传入容器 + mermaid 文本，容器即被渲染为可缩放、可交互高亮的图表
  const diagram = MermaidHighlighter.renderToContainer(
    document.getElementById('container'),
    'graph TD;\n  A --> B;\n  B --> C;'
  );
  // 手动触发重新渲染
  diagram.render('graph LR;\n  X --> Y;');
  // 缩放
  diagram.zoomIn();
  // 高亮指定节点（其上下游）
  diagram.highlightNode('B');
  // 切换配色方案（light / dark / business）
  diagram.setTheme('dark');
  // 查看可用配色
  console.log(diagram.getThemes());
  // 下载当前 SVG（默认 mermaid-diagram.svg）
  diagram.downloadSvg('my-diagram.svg');
</script>
```

> 说明：`renderToContainer` 仅在浏览器环境可用；Node 环境请使用 `renderMermaid`。

## 可视化编辑页面（`index.html`）

页面为离线可用的编辑器，核心交互如下：

- 右侧 SVG 的**渲染 / 缩放 / 点击高亮**均委托给 `index.js` 的
  `renderToContainer`，页面本身只负责布局与编辑器交互。

- **顶部工具栏**：标题 + 状态提示 + 视图模式切换按钮（分栏 / 仅左侧 / 仅右侧）。
- **左右分栏**：中间分隔条可拖拽调整两侧比例（限制在 15% ~ 85% 之间）。
- **仅显示单侧**：通过工具栏右侧按钮，可一键切换为仅显示左侧或仅显示右侧。
- **自动渲染**：左侧文本编辑器停止输入 **2 秒** 后，自动将文本交给 mermaid
  渲染，并把结果 SVG 显示到右侧容器。
- **点击高亮上下游**（仅 `graph` / `flowchart` 图生效）：点击图中某个节点，
  会向上游（指向它的节点）和下游（它指向的节点）查找所有关联节点及连线，
  其余所有节点与连线变浅灰色；再次点击该节点或点击空白处可取消高亮。
  - 兼容 mermaid 所有节点形状（矩形/菱形/圆形/圆柱/六边形/平行四边形等）与
    纯 id 节点（无名称）。
  - 兼容所有连线类型（`-->`、`---`、`-.->`、`==>` 等）、连线注释、以及连线
    与注释前后有无空格的各种写法。

### 离线资源

仓库内为本地演示提供了离线 mermaid 构建 `vendor/mermaid/`（`mermaid.min.js` +
`chunks/`），不依赖 CDN。注意：**该目录仅存在于源码仓库，不随 npm 包发布**。
若需要完全离线部署，请自行放置 mermaid 构建并通过 `options.mermaidUrl` 指定，
例如：`MermaidHighlighter.renderToContainer(el, text, { mermaidUrl: 'vendor/mermaid.min.js' })`。

> 仓库内 `vendor/mermaid` 来自 `node_modules/mermaid/dist`，如需重新生成：
> `Copy-Item node_modules/mermaid/dist/mermaid.min.js, node_modules/mermaid/dist/chunks -Destination vendor/mermaid -Recurse`

### 必须用本地服务器打开（重要）

建议在项目目录启动一个本地静态服务器，然后用 `http://` 访问：

```bash
# 方式一：Node
npx serve
# 方式二：Python 3
python -m http.server 8000
```

随后浏览器访问 `http://localhost:8000/index.html`（或 serve 打印的地址）。

## TODO

 - [x] 高光功能增加对edge注释的处理
 - [ ] 允许拖拽节点位置
 - [ ] 允许拖拽线条位置并保证箭头吸附在节点上

## License

MIT
