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

## 可视化编辑页面（`index.html`）

页面为离线可用的编辑器，核心交互如下：

- **顶部工具栏**：标题 + 状态提示 + 视图模式切换按钮（分栏 / 仅左侧 / 仅右侧）。
- **左右分栏**：中间分隔条可拖拽调整两侧比例（限制在 15% ~ 85% 之间）。
- **仅显示单侧**：通过工具栏右侧按钮，可一键切换为仅显示左侧或仅显示右侧。
- **自动渲染**：左侧文本编辑器停止输入 **2 秒** 后，自动将文本交给 mermaid
  渲染，并把结果 SVG 显示到右侧容器。

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
