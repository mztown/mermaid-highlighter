# mermaid-highlighter

将 mermaid 文本渲染为 SVG 的 JS 模块，并提供离线可用的可视化编辑页面。

## 安装

```bash
npm install
# 若在 Node.js（服务端）环境使用，需额外安装 jsdom：
npm install jsdom
```

## 用法

```js
const { renderMermaid } = require('mermaid-highlighter');

(async () => {
  const svg = await renderMermaid('graph TD;\n  A-->B;\n  B-->C;');
  console.log(svg); // 完整 SVG 字符串
})();
```

### 自定义主题

`renderMermaid(text, options)` 的第二个参数会透传给 `mermaid.initialize`：

```js
const svg = await renderMermaid('graph TD;\n A-->B;', { theme: 'dark' });
```

## 环境支持

- **浏览器**：直接使用全局 `window.mermaid` 渲染，无需 `jsdom`。
- **Node.js（服务端）**：自动通过 `jsdom` 创建 DOM 环境进行渲染（需安装 `jsdom`），
  渲染完成后会自动清理注入的全局对象，避免影响同进程内其他代码。

## API

### `renderMermaid(mermaidText, options?)`

- `mermaidText` `<string>`：mermaid 语法文本（必填，非空，否则抛出 `TypeError`）。
- `options` `<object>`：可选，mermaid 初始化配置。
- 返回：`<Promise<string>>` 渲染后的完整 SVG 字符串。
- 说明：mermaid v11 的 `render` 返回 `{ svg, diagramType, bindFunctions }` 对象，
  本方法已归一化为直接返回其中的 `svg` 字符串。

### `renderToContainer(container, mermaidText, options?)`（浏览器）

在指定容器内渲染一个**可缩放、可交互高亮**的 mermaid 图。任意 HTML 页面只需引入
`index.js`（并确保 `window.mermaid` 可用）即可使用。

- `container` `<HTMLElement>`：目标容器元素。
- `mermaidText` `<string>`：mermaid 文本。
- `options` `<object>`：可选配置，支持：
  - `onZoomChange(level)`：缩放比例变化回调
  - `onRendered(svg)`：渲染完成回调
  - `onError(message)`：渲染出错回调
- 返回：`<object>` 控制句柄，包含：
  - `render(text)` / `update(text)`：重新渲染
  - `getSvg()`：获取当前 SVG 元素
  - `zoomIn()` / `zoomOut()` / `resetZoom()` / `setZoom(level)` / `getZoom()`：缩放控制
  - `highlightNode(nodeId)` / `clearHighlight()`：点击高亮控制
  - `destroy()`：销毁实例并移除事件监听

浏览器用法示例：

```html
<!-- 引入 mermaid 与 index.js -->
<script src="vendor/mermaid/mermaid.min.js"></script>
<script src="index.js"></script>
<script>
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

mermaid 浏览器构建已本地化到 `vendor/mermaid/`（`mermaid.min.js` + `chunks/`），
不再依赖 CDN。`mermaid.min.js` 为自包含的 esbuild IIFE 产物，末尾会自动将
mermaid 挂到 `globalThis.mermaid`（即 `window.mermaid`），`index.js` 的浏览器
分支可直接命中，无需额外脚本。

> 已包含的 `vendor/mermaid` 来自 `node_modules/mermaid/dist`，如需重新生成：
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

## License

MIT
