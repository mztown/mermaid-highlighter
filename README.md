# Mermaid Highlighter

- [中文说明](./README.zh.md)

A plug-and-play module that renders mermaid text into a zoomable, interactive, highlightable SVG.
Works in both Node.js and the browser, with TypeScript type declarations included.

![demo](https://mztown.github.io/highlighting.svg)

![action demo](https://mztown.github.io/MHdisplay.gif)

## Live Demos

Preview the capabilities and page effects of this module online:

- [Online Editor](https://mztown.github.io/editor) — a visual editor with mermaid text on the left and real-time rendering on the right
- [Display Board](https://mztown.github.io/displayBoard) — a chart display / showcase board page

## Installation

```bash
npm install mermaid-highlighter
# If you use it in Node.js (server-side), also install jsdom:
npm install jsdom
```

> Multiple entry points (CommonJS / ESM / TypeScript) are provided via `exports`,
> so both `import` and `require` work out of the box.

## Usage

### Node.js (server-side)

```js
const { renderMermaid } = require('mermaid-highlighter');
// or: import { renderMermaid } from 'mermaid-highlighter';

(async () => {
  const svg = await renderMermaid('graph TD;\n  A-->B;\n  B-->C;');
  console.log(svg); // the full SVG string
})();
```

### Browser (plug-and-play)

In any HTML page, just include the module (mermaid is loaded dynamically by the module
itself), pass in a DOM container and some mermaid text, and you get a zoomable,
interactive, highlightable chart.

> **Note**: the npm package does **not** include the `vendor/` directory, so in the
> browser (non-bundler) scenario you must provide a usable mermaid build via
> `options.mermaidUrl` (e.g. a CDN).

#### Method 1: Include via CDN (simplest)

```html
<!-- Only this module is needed; mermaid is loaded from CDN via mermaidUrl -->
<script src="https://unpkg.com/mermaid-highlighter@1.0.1/index.js"></script>
<div id="container" style="width: 600px; height: 400px;"></div>
<script>
  const diagram = MermaidHighlighter.renderToContainer(
    document.getElementById('container'),
    'graph TD;\n  A --> B;\n  B --> C;',
    { mermaidUrl: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js' }
  );
  // zoom / highlight / theme / download
  diagram.zoomIn();
  diagram.highlightNode('B');
  diagram.setTheme('dark');
  diagram.downloadSvg('diagram.svg');
</script>
```

> The global object is named `MermaidHighlighter`. CDN URLs are available on unpkg or jsdelivr:
> - `https://unpkg.com/mermaid-highlighter@1.0.1/index.js`
> - `https://cdn.jsdelivr.net/npm/mermaid-highlighter@1.0.1/index.js`

#### Method 2: Copy the module files manually

Copy `index.js` (optionally together with `index.mjs`, `index.d.ts`) into your project
directory, then include it as a normal script; you still need to specify a mermaid build
via `mermaidUrl`:

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

For a fully offline setup, first place a mermaid build locally (e.g. `vendor/mermaid.min.js`),
then point to it with a local path: `{ mermaidUrl: 'vendor/mermaid.min.js' }`.

#### Method 3: Bundler (webpack / vite / rollup)

When using a bundler there is no need to set `mermaidUrl` manually — the module resolves
mermaid automatically from your project's `node_modules` via `require('mermaid')`:

```js
import { renderToContainer } from 'mermaid-highlighter';

const diagram = renderToContainer(
  document.getElementById('container'),
  'graph TD;\n  A --> B;',
  { theme: 'business', enableScrollZoom: true }
);
```

### YAML front-matter is ignored automatically

If the mermaid text begins with YAML header metadata enclosed by three dashes (e.g. an
`id` exported from an editor), both rendering and highlight parsing **automatically ignore**
that block — there is no need to remove it manually:

```text
---
id: 5BE08626-8499-4DEC-8EC4-A383A9184D72
---
graph TD;
  A --> B;
```

### Custom theme

The second argument of `renderMermaid(text, options)` is passed through to
`mermaid.initialize`:

```js
const svg = await renderMermaid('graph TD;\n A-->B;', { theme: 'dark' });
```

## Environment support

- **Browser**: the module **loads mermaid dynamically by itself**. With a bundler it
  resolves mermaid from `node_modules` (`require('mermaid')`) by default; with CDN /
  manual-copy usage you must specify a build path via `options.mermaidUrl` (the published
  package has no `vendor/`; the default path only works for a local in-repo build).
  There is no need to include a mermaid script separately in HTML; rendering happens
  directly against the DOM of the provided container.
- **Node.js (server-side)**: a DOM environment is created automatically via `jsdom`
  (requires `jsdom`). After rendering, the injected globals are cleaned up automatically
  so they do not affect other code in the same process.

## API

### `renderMermaid(mermaidText, options?)`

- `mermaidText` `<string>`: the mermaid syntax text (required; must be non-empty,
  otherwise a `TypeError` is thrown).
- `options` `<object>`: optional mermaid initialization config; additionally supports
  `mermaidUrl` to specify the load path of the browser-side mermaid build (bundler mode
  resolves `mermaid` automatically; CDN/manual-copy mode needs it explicitly, see
  "Browser (plug-and-play)" above).
- Returns: `<Promise<string>>` — the full rendered SVG string.
- Note: mermaid v11's `render` returns `{ svg, diagramType, bindFunctions }`; this method
  normalizes it to return just the `svg` string.

### `renderToContainer(container, mermaidText, options?)` (browser)

**Renders the given mermaid text directly into the given DOM**, producing a zoomable,
interactive, highlightable mermaid chart. Any HTML page **only needs to include
`index.js`** (no separate mermaid include) to use it.

- `container` `<HTMLElement>`: the target container element; the rendered result is
  written into this element.
- `mermaidText` `<string>`: the mermaid text.
- `options` `<object>`: optional config; supports:
  - `theme`: color scheme key (default `light`)
  - `mermaidUrl`: load path of the mermaid build (bundler mode resolves `mermaid`
    automatically; CDN/manual-copy mode needs it explicitly, e.g. a jsdelivr / unpkg
    mermaid@11 URL)
  - `mermaid`: extra mermaid initialization config (merged into the theme config)
  - `enableScrollZoom`: whether the mouse wheel can zoom directly (centered on the
    pointer), default `true`; set to `false` to disable
  - `autoTheme`: whether to automatically switch between dark/light themes based on the
    system/browser color scheme, default `false`; when `true`, the chart follows system
    changes automatically (dark ↔ light)
  - `customThemes`: user-defined color schemes, format
    `{ [key]: { label, background, highlight, mermaid } }`, merged into the built-in
    themes and usable via `theme` / `setTheme(key)`
  - `onZoomChange(level)`: zoom-level change callback
  - `onRendered(svg)`: render-completed callback
  - `onError(message)`: render-error callback
  - `onThemeChange(key)`: theme-change callback
- Returns: `<object>` control handle, including:
  - `render(text)` / `update(text)`: re-render
  - `getSvg()`: get the current SVG element
  - `getSvgString()`: get the current SVG as a string (including XML declaration and
    namespace)
  - `downloadSvg(filename?)`: download the current SVG image (default file name
    `mermaid-diagram.svg`)
  - `zoomIn()` / `zoomOut()` / `resetZoom()` / `setZoom(level)` / `getZoom()`: zoom control
  - `highlightNode(nodeId)` / `clearHighlight()`: click-highlight control
  - `getTheme()` / `setTheme(key)` / `getThemes()`: color scheme control
  - `destroy()`: destroy the instance and clean up content

> Note: `downloadSvg` first bakes the current highlight/dim states into inline styles
> before exporting, so the downloaded `.svg` file renders the complete diagram correctly
> in any viewer.

#### Color schemes

Three built-in color schemes are provided, switchable via the `theme` option or
`setTheme(key)`:

| key | Name | Background | Elements | Highlight |
|-----|------|------------|----------|-----------|
| `light` | Light Classic | White | Black / dark gray | Blue |
| `dark` | Dark Classic | Black | White | Red |
| `business` | Business Blue | Light blue-gray | Dark blue border | Cyan blue |

The schemes control the main body colors via mermaid's `themeVariables` and keep the canvas
background and node highlight (`is-active` glow) colors in sync.

**Custom color scheme**: pass a custom theme via `customThemes`; it is merged into the
built-in themes and can be used with `theme` / `setTheme(key)`:

```js
const diagram = MermaidHighlighter.renderToContainer(el, text, {
  customThemes: {
    ocean: {
      label: 'Ocean Green',
      background: '#f0fdf4',        // container background
      highlight: '#16a34a',         // highlight glow color
      mermaid: {                    // mermaid themeVariables config
        theme: 'base',
        themeVariables: {
          primaryColor: '#dcfce7',
          primaryTextColor: '#14532d',
          primaryBorderColor: '#16a34a',
        },
      },
    },
  },
  theme: 'ocean',                   // use the custom theme directly
});
```

Browser usage example (the HTML page only needs to include `index.js`):

```html
<div id="container" style="width: 600px; height: 400px;"></div>

<!-- Only index.js is needed; mermaid is loaded automatically -->
<script src="index.js"></script>
<script>
  // Pass a container + mermaid text; the container is rendered into a zoomable,
  // interactive, highlightable chart
  const diagram = MermaidHighlighter.renderToContainer(
    document.getElementById('container'),
    'graph TD;\n  A --> B;\n  B --> C;'
  );
  // Trigger a re-render manually
  diagram.render('graph LR;\n  X --> Y;');
  // Zoom
  diagram.zoomIn();
  // Highlight the upstream/downstream of a node
  diagram.highlightNode('B');
  // Switch color scheme (light / dark / business)
  diagram.setTheme('dark');
  // List available schemes
  console.log(diagram.getThemes());
  // Download the current SVG (default mermaid-diagram.svg)
  diagram.downloadSvg('my-diagram.svg');
</script>
```

> Note: `renderToContainer` is only available in the browser; use `renderMermaid` in a
> Node.js environment.

## Visual editor page (`index.html`)

This page is an offline-capable editor with the following core interactions:

- The **render / zoom / click-highlight** of the right-hand SVG are all delegated to
  `index.js`'s `renderToContainer`; the page itself only handles layout and editor
  interaction.

- **Top toolbar**: title + status hint + view-mode switch buttons (split / left only /
  right only).
- **Left-right split**: the middle divider can be dragged to adjust the two panes'
  ratio (clamped between 15% and 85%).
- **Single-pane display**: via the buttons on the right side of the toolbar, you can
  switch to showing only the left or only the right pane.
- **Auto render**: 2 seconds after the left editor stops accepting input, the text is
  handed to mermaid for rendering and the resulting SVG is shown in the right container.
- **Click to highlight upstream/downstream** (only works for `graph` / `flowchart`):
  clicking a node finds all related nodes and edges upstream (nodes pointing to it) and
  downstream (nodes it points to); all other nodes and edges are dimmed to a light gray.
  Clicking the node again or clicking empty space cancels the highlight.
  - Supports all mermaid node shapes (rectangle/diamond/circle/cylinder/hexagon/
    parallelogram, etc.) and plain-id nodes (with no label).
  - Supports all edge types (`-->`, `---`, `-.->`, `==>`, etc.), edge labels, and various
    spacings around the edge arrow / label.

### Offline assets

The repo ships an offline mermaid build at `vendor/mermaid/` (`mermaid.min.js` +
`chunks/`) for local demos, with no CDN dependency. Note: **this directory exists only in
the source repo and is not published to npm**. For a fully offline deployment, place a
mermaid build yourself and point to it via `options.mermaidUrl`, e.g.:
`MermaidHighlighter.renderToContainer(el, text, { mermaidUrl: 'vendor/mermaid.min.js' })`.

> The repo's `vendor/mermaid` comes from `node_modules/mermaid/dist`; to regenerate it:
> `Copy-Item node_modules/mermaid/dist/mermaid.min.js, node_modules/mermaid/dist/chunks -Destination vendor/mermaid -Recurse`

### Must be opened with a local server (important)

It is recommended to start a local static server in the project directory, then access it
via `http://`:

```bash
# Option 1: Node
npx serve
# Option 2: Python 3
python -m http.server 8000
```

Then open `http://localhost:8000/index.html` in your browser (or the address printed by serve).

## TODO

 - [x] Add support for handling edge labels in the highlight feature
 - [ ] Allow dragging node positions
 - [ ] Allow dragging edge lines and keep arrowheads snapped to nodes

## License

MIT
