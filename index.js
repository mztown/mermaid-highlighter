'use strict';

/**
 * mermaid-highlighter
 *
 * 将 mermaid 文本渲染为 SVG 的独立模块，并提供：
 *  - 缩放（滚轮 / 按钮 / 键盘）
 *  - 点击节点高亮上游/下游
 * 两种能力。支持 CommonJS（Node）与浏览器 <script> 全局两种用法。
 *
 * 在浏览器中，本模块会自行动态加载 mermaid 构建（默认从
 * `vendor/mermaid/mermaid.min.js` 加载），HTML 页面只需引入本脚本即可。
 *
 * 用法一：Node.js
 *   const { renderMermaid, renderToContainer } = require('mermaid-highlighter');
 *   const svg = await renderMermaid('graph TD; A-->B;');
 *
 * 用法二：浏览器（只需引入本文件，无需单独引入 mermaid）
 *   <script src="index.js"></script>
 *   <script>
 *     const diagram = MermaidHighlighter.renderToContainer(
 *       document.getElementById('container'),
 *       'graph TD; A-->B; B-->C;'
 *     );
 *   </script>
 *
 * 若 mermaid 构建不在默认路径，可通过 options.mermaidUrl 指定：
 *   MermaidHighlighter.renderToContainer(el, text, { mermaidUrl: '/path/mermaid.min.js' });
 */

/* ============================================================
 * 环境判断与 mermaid 加载
 * ============================================================ */

/**
 * 判断当前是否运行在浏览器环境中。
 * @returns {boolean}
 */
function isBrowser() {
  return (
    typeof window !== 'undefined' && typeof window.document !== 'undefined'
  );
}

/** mermaid.min.js 的默认加载路径（相对当前页面）。 */
const DEFAULT_MERMAID_URL = 'vendor/mermaid/mermaid.min.js';

/**
 * 剥离 mermaid 文本开头的 YAML front-matter（由三条横杠包围的头部元信息，
 * 如 `id: xxx` 占三行）。渲染时主动忽略这类头部，避免传给 mermaid 解析出错。
 * @param {string} text 原始 mermaid 文本
 * @returns {string} 去除 front-matter 后的文本
 */
function stripFrontMatter(text) {
  if (typeof text !== 'string') return text;
  // 去掉行首空白后按行切分，判断首行是否为 `---`
  const lines = text.split(/\r?\n/);
  let start = 0;
  if (lines.length >= 3 && lines[0].trim() === '---') {
    // 找到第二个 `---` 作为结束标记（从第 2 行开始找）
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        start = i + 1; // 跳过结尾的 `---`
        break;
      }
    }
  }
  if (start === 0) return text;
  const rest = lines.slice(start).join('\n');
  return rest.trim();
}

/** 模块级 mermaid 加载 Promise（缓存，避免重复加载）。 */
let mermaidLoadPromise = null;

/**
 * 在浏览器中通过 <script> 标签动态加载 mermaid.min.js。
 * @param {string} url mermaid 脚本路径
 * @returns {Promise<object>} mermaid 实例
 */
function loadMermaidFromScript(url) {
  return new Promise((resolve, reject) => {
    // 若已经加载过（window.mermaid 已存在），直接使用
    if (typeof window.mermaid !== 'undefined') {
      resolve(window.mermaid);
      return;
    }
    // 防止重复注入
    if (document.querySelector('script[data-mermaid-highlighter-src]')) {
      // 已有加载中，轮询等待
      const timer = setInterval(() => {
        if (typeof window.mermaid !== 'undefined') {
          clearInterval(timer);
          resolve(window.mermaid);
        }
      }, 50);
      // 超时保护
      setTimeout(() => {
        clearInterval(timer);
        reject(new Error('加载 mermaid 超时。'));
      }, 20000);
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.setAttribute('data-mermaid-highlighter-src', 'true');
    script.onload = () => {
      if (typeof window.mermaid !== 'undefined') {
        resolve(window.mermaid);
      } else {
        reject(new Error('mermaid 脚本已加载，但未找到 window.mermaid。'));
      }
    };
    script.onerror = () => {
      reject(new Error('无法加载 mermaid 脚本：' + url));
    };
    (document.head || document.documentElement).appendChild(script);
  });
}

/**
 * 解析 mermaid 模块（处理 CJS 的 ESM 转译产物，取 .default）。
 * @param {object} raw require/import 得到的模块
 * @returns {object} mermaid API
 */
function normalizeMermaid(raw) {
  return raw && raw.default ? raw.default : raw;
}

/**
 * 懒加载 mermaid 库。
 * 浏览器加载顺序：
 *   1. `window.mermaid`（已由其他方式引入）
 *   2. `require('mermaid')`（被 bundler 打包时的 node_modules 依赖）
 *   3. 动态加载 mermaid 构建（默认 vendor 或 mermaidUrl 指定的 CDN/路径）
 * Node：require('mermaid')。
 * @param {string} [url] mermaid 脚本路径（浏览器动态加载时使用）
 * @returns {Promise<object>}
 */
async function loadMermaid(url) {
  if (isBrowser()) {
    if (typeof window.mermaid !== 'undefined') {
      return window.mermaid;
    }
    // bundler 场景：模块已被打包，可尝试 require('mermaid')
    if (typeof require === 'function') {
      try {
        const m = require('mermaid');
        if (m && (typeof m.initialize === 'function' || m.default)) {
          return normalizeMermaid(m);
        }
      } catch (_) {
        /* 无 node_modules 依赖时忽略，走动态加载 */
      }
    }
    // 动态加载 mermaid 构建，URL 由调用方传入或使用默认路径
    const scriptUrl = url || DEFAULT_MERMAID_URL;
    if (!mermaidLoadPromise) {
      mermaidLoadPromise = loadMermaidFromScript(scriptUrl);
      // 失败后允许下次重试
      mermaidLoadPromise.catch(() => {
        mermaidLoadPromise = null;
      });
    }
    return mermaidLoadPromise;
  }

  try {
    const mermaid = require('mermaid');
    return normalizeMermaid(mermaid);
  } catch (err) {
    throw new Error(
      '无法加载 mermaid 库。请先在项目目录执行 `npm install mermaid`。'
    );
  }
}

/**
 * 在 Node 环境中通过 jsdom 创建隔离 DOM 环境。
 * @returns {Promise<{dom, mermaid, injectedKeys}>}
 */
async function createNodeDom() {
  const { JSDOM } = require('jsdom');

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
  });

  const { window } = dom;
  const injectedKeys = [];
  const injectGlobal = (name, value) => {
    Object.defineProperty(global, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    injectedKeys.push(name);
  };

  injectGlobal('window', window);
  injectGlobal('document', window.document);
  injectGlobal('navigator', window.navigator);
  injectGlobal('HTMLElement', window.HTMLElement);
  injectGlobal('Element', window.Element);
  injectGlobal('Node', window.Node);
  injectGlobal(
    'requestAnimationFrame',
    window.requestAnimationFrame || ((cb) => setTimeout(cb, 0))
  );
  [
    'DocumentFragment',
    'Event',
    'EventTarget',
    'MouseEvent',
    'CustomEvent',
    'DOMException',
    'CSSStyleSheet',
    'SVGElement',
    'SVGSVGElement',
    'SVGGraphicsElement',
    'SVGGElement',
    'SVGPathElement',
    'SVGRect',
    'DOMRect',
    'Text',
    'Comment',
    'MutationObserver',
    'DOMParser',
    'XMLSerializer',
  ].forEach((name) => {
    if (typeof window[name] !== 'undefined') {
      injectGlobal(name, window[name]);
    }
  });

  // jsdom 未实现 SVG 几何测量方法，注入固定尺寸 polyfill 完成布局计算。
  const svgElementProto = window.SVGElement && window.SVGElement.prototype;
  if (svgElementProto && !svgElementProto.getBBox) {
    svgElementProto.getBBox = function getBBox() {
      return { x: 0, y: 0, width: 0, height: 0 };
    };
  }
  if (svgElementProto && !svgElementProto.getCTM) {
    svgElementProto.getCTM = function getCTM() {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    };
  }
  if (svgElementProto && !svgElementProto.getScreenCTM) {
    svgElementProto.getScreenCTM = function getScreenCTM() {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    };
  }

  const mermaid = normalizeMermaid(require('mermaid'));

  return { dom, mermaid, injectedKeys };
}

/**
 * 将传入的 mermaid 文本渲染为 SVG 字符串（Node 与浏览器通用）。
 *
 * @param {string} mermaidText mermaid 语法文本（必填，非空）
 * @param {object} [options] 可选。mermaid 初始化配置；额外支持 `mermaidUrl`
 *        用于指定浏览器端动态加载的 mermaid 构建路径。
 * @returns {Promise<string>} 渲染后的完整 SVG 字符串
 * @throws {TypeError} mermaidText 缺失或非字符串时抛出
 */
async function renderMermaid(mermaidText, options = {}) {
  if (typeof mermaidText !== 'string' || mermaidText.trim() === '') {
    throw new TypeError('renderMermaid: mermaidText 必须是非空字符串。');
  }
  // 忽略开头的 YAML front-matter（`---` 包围的 id 等），避免 mermaid 解析报错
  mermaidText = stripFrontMatter(mermaidText);

  const isNodeEnv = !isBrowser();
  let mermaid;
  let dom = null;
  let injectedKeys = [];

  if (isNodeEnv) {
    const ctx = await createNodeDom();
    dom = ctx.dom;
    mermaid = ctx.mermaid;
    injectedKeys = ctx.injectedKeys;
  } else {
    mermaid = await loadMermaid(options.mermaidUrl);
  }

  try {
    if (mermaid.initialize) {
      // 剔除内部使用的 mermaidUrl 配置，避免传给 mermaid.initialize
      const { mermaidUrl, ...mermaidConfig } = options;
      mermaid.initialize({ startOnLoad: false, ...mermaidConfig });
    }
    const result = await mermaid.render('mermaid-svg', mermaidText);
    if (typeof result === 'string') return result;
    if (result && typeof result.svg === 'string') return result.svg;
    throw new Error('renderMermaid: mermaid.render 返回了无法识别的结果。');
  } finally {
    if (isNodeEnv && dom) {
      injectedKeys.forEach((key) => {
        try {
          delete global[key];
        } catch (_) {
          /* 忽略个别属性删除失败 */
        }
      });
      dom.window.close();
    }
  }
}

/* ============================================================
 * 浏览器端：渲染 + 缩放 + 高亮的完整交互模块
 * ============================================================ */

// 模块所需的样式（通过 <style> 自动注入，无需页面额外 CSS）。
// 所有选择器均以传入容器内的 .mermaid-highlighter-canvas 为作用范围。
const MODULE_CSS = `
  .mermaid-highlighter-canvas {
    display: block;
    transform-origin: 0 0;
    transition: transform 0.15s ease;
  }
  /* 各主题：canvas 上的主题 class 提供高亮色（背景色由容器内联样式控制） */
  .mermaid-highlighter-canvas.mh-theme-light {
    --mh-highlight: #2f81f7;
  }
  .mermaid-highlighter-canvas.mh-theme-dark {
    --mh-highlight: #f85149;
  }
  .mermaid-highlighter-canvas.mh-theme-business {
    --mh-highlight: #0e7490;
  }
  .mermaid-highlighter-canvas svg .node {
    cursor: pointer;
    transition: opacity 0.2s ease;
  }
  .mermaid-highlighter-canvas svg .node.is-active .label-container {
    filter: drop-shadow(
      0 0 3px var(--mh-highlight, #2f81f7)
    );
  }
  .mermaid-highlighter-canvas svg .node.is-active {
    opacity: 1;
  }
  .mermaid-highlighter-canvas svg.is-dimmed .node:not(.is-relevant),
  .mermaid-highlighter-canvas svg.is-dimmed .edgePaths .flowchart-link:not(.is-relevant) {
    opacity: 0.18;
    filter: grayscale(1);
  }
  .mermaid-highlighter-canvas svg.is-dimmed .node.is-relevant,
  .mermaid-highlighter-canvas svg.is-dimmed .edgePaths .flowchart-link.is-relevant {
    opacity: 1;
    filter: none;
  }
  /* 边的文本：明暗程度与所在边保持一致（相关边文本正常，非相关边文本下沉） */
  .mermaid-highlighter-canvas svg.is-dimmed .edgeLabels .edgeLabel:not(.is-relevant) {
    opacity: 0.18;
    filter: grayscale(1);
  }
  /* 相关边文本：group 级负责亮度（作用于整个标签块，含背景） */
  .mermaid-highlighter-canvas svg.is-dimmed .edgeLabels .edgeLabel.is-relevant {
    opacity: 1;
    filter: none;
  }
  /* 相关边文本文字：颜色跟随 mermaid 默认文字色（与节点文字保持一致），不写死 */
  .mermaid-highlighter-canvas svg.is-dimmed .edgeLabels .edgeLabel.is-relevant p {
    color: inherit;
  }
  /* subgraph (cluster)：框与文本明暗与框内是否含相关节点关联。
     含相关节点的 cluster 及其 label 保持正常亮度，否则整体下沉变暗。 */
  .mermaid-highlighter-canvas svg.is-dimmed g.cluster:not(.is-relevant) {
    opacity: 0.18;
    filter: grayscale(1);
  }
  .mermaid-highlighter-canvas svg.is-dimmed g.cluster.is-relevant {
    opacity: 1;
    filter: none;
  }
  .mermaid-highlighter-canvas svg.is-dimmed g.cluster.is-relevant .cluster-label p {
    color: inherit;
  }
  .mermaid-highlighter-empty,
  .mermaid-highlighter-error {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #8b949e;
    font-size: 14px;
    gap: 8px;
    text-align: center;
    padding: 16px;
    box-sizing: border-box;
  }
  .mermaid-highlighter-error {
    color: #d1242f;
  }
`;

/**
 * 默认配色方案。
 * 每个方案包含：
 *  - key       方案标识
 *  - label     显示名称
 *  - mermaid   mermaid 初始化配置（theme + themeVariables），用于控制渲染主体配色
 *  - highlight 高亮颜色（用于选中节点/相关节点的描边发光）
 *  - background 画布背景色
 */
const THEMES = {
  light: {
    key: 'light',
    label: '浅色经典',
    background: '#ffffff',
    highlight: '#2f81f7',
    mermaid: {
      theme: 'base',
      themeVariables: {
        background: '#ffffff',
        primaryColor: '#f0f4ff',
        primaryTextColor: '#1f2328',
        primaryBorderColor: '#1f2328',
        lineColor: '#1f2328',
        textColor: '#1f2328',
        edgeLabelBackground: '#ffffff',
        nodeBorder: '#1f2328',
        clusterBkg: '#f6f8fa',
        clusterBorder: '#d0d7de',
      },
    },
  },
  dark: {
    key: 'dark',
    label: '深色经典',
    background: '#0d1117',
    highlight: '#f85149',
    mermaid: {
      theme: 'base',
      themeVariables: {
        background: '#0d1117',
        primaryColor: '#161b22',
        primaryTextColor: '#f0f6fc',
        primaryBorderColor: '#f0f6fc',
        lineColor: '#f0f6fc',
        textColor: '#f0f6fc',
        edgeLabelBackground: '#0d1117',
        nodeBorder: '#f0f6fc',
        clusterBkg: '#161b22',
        clusterBorder: '#30363d',
      },
    },
  },
  business: {
    key: 'business',
    label: '商务蓝',
    background: '#fbfcfe',
    highlight: '#0e7490',
    mermaid: {
      theme: 'base',
      themeVariables: {
        background: '#fbfcfe',
        primaryColor: '#e8f1fa',
        primaryTextColor: '#0b1f33',
        primaryBorderColor: '#1e6fd9',
        lineColor: '#33475b',
        textColor: '#0b1f33',
        edgeLabelBackground: '#fbfcfe',
        nodeBorder: '#1e6fd9',
        clusterBkg: '#f0f6fc',
        clusterBorder: '#9dc1e8',
      },
    },
  },
};

/** 获取默认主题 key。 */
function getDefaultThemeKey() {
  return 'light';
}

/** 根据 key 解析主题配置；未知 key 回退到默认主题。 */
function resolveTheme(key) {
  if (key && THEMES[key]) return THEMES[key];
  return THEMES[getDefaultThemeKey()];
}

let styleInjected = false;

/** 向页面注入模块样式（仅一次）。 */
function injectStyles() {
  if (styleInjected || !isBrowser()) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = MODULE_CSS;
  style.setAttribute('data-mermaid-highlighter', 'true');
  (document.head || document.documentElement).appendChild(style);
}

/**
 * 解析 mermaid flowchart 文本，判断是否为 graph/flowchart 并提取节点与边。
 * 兼容所有节点形状、纯 id 节点、连线注释、链式边、连线/注释前后有无空格。
 * @param {string} text
 * @returns {{ isFlowchart: boolean, nodes: string[], edges: Array<[string,string]> }}
 */
function parseFlowchart(text) {
  if (typeof text !== 'string') {
    return { isFlowchart: false, nodes: [], edges: [] };
  }
  text = stripFrontMatter(text);
  const firstLine = (text.split('\n')[0] || '').trim();
  const isFlowchart = /^(graph|flowchart)\b/.test(firstLine);
  if (!isFlowchart) {
    return { isFlowchart: false, nodes: [], edges: [] };
  }

  const nodes = {};
  const edges = [];

  const linkSyms = [
    '--->', '-->', '---', '--',
    '-.->', '-.-', '-.', '.->', '.-',
    '==>', '===', '==',
  ];
  const matchLinkSymbol = (s, pos) => {
    for (let k = 0; k < linkSyms.length; k++) {
      if (s.slice(pos, pos + linkSyms[k].length) === linkSyms[k]) {
        return linkSyms[k].length;
      }
    }
    return 0;
  };

  const extractNodeId = (token) => {
    let t = (token || '').trim();
    if (!t) return '';
    while (t.charAt(0) === '|') {
      const end = t.indexOf('|', 1);
      if (end === -1) break;
      t = t.slice(end + 1).trim();
    }
    const m = /^[A-Za-z0-9_\u00a0-\uffff.]+/.exec(t);
    return m ? m[0] : '';
  };

  // “开符号”：不完整连线符，标志注释文本开始（如 -- text --> 中的 --）。
  const openSymbols = { '--': true, '-.': true, '==': true };

  const tryParseEdge = (line) => {
    const open = '([{<';
    const close = ')]}>';
    let depth = 0;
    const positions = [];
    let i = 0;
    const n = line.length;
    while (i < n) {
      const ch = line[i];
      if (depth === 0) {
        const len = matchLinkSymbol(line, i);
        if (len > 0) {
          positions.push({ start: i, len, sym: line.slice(i, i + len) });
          i += len;
          continue;
        }
      }
      const oi = open.indexOf(ch);
      if (oi !== -1) {
        depth++;
      } else {
        const ci = close.indexOf(ch);
        if (ci !== -1) depth = Math.max(0, depth - 1);
      }
      i++;
    }
    if (positions.length === 0) return [];

    const segments = [line.slice(0, positions[0].start)];
    for (let k = 0; k < positions.length - 1; k++) {
      segments.push(
        line.slice(positions[k].start + positions[k].len, positions[k + 1].start)
      );
    }
    segments.push(
      line.slice(
        positions[positions.length - 1].start + positions[positions.length - 1].len
      )
    );

    const isComment = {};
    for (let c = 1; c < positions.length; c++) {
      const leftSym = positions[c - 1].sym;
      const rightSym = positions[c].sym;
      if (openSymbols[leftSym] && !openSymbols[rightSym]) {
        isComment[c] = true;
      }
    }

    const nodeIds = segments.map((seg, idx) =>
      isComment[idx] ? null : extractNodeId(seg)
    );

    const out = [];
    let prevNode = null;
    for (let idx = 0; idx < nodeIds.length; idx++) {
      const nid = nodeIds[idx];
      if (nid) {
        if (prevNode !== null) out.push([prevNode, nid]);
        prevNode = nid;
      }
    }
    return out;
  };

  const statements = text
    .split('\n')
    .map((l) => l.replace(/%%.*$/, ''))
    .join('\n')
    .split(/[;\n]/);

  // subgraph 结构：记录每个 subgraph id 包含的节点 id。
  // 由于渲染出的 SVG 中 cluster 与 node 是平级 group（cluster 不包含 node），
  // 只能通过文本解析建立 subgraph → 节点 的归属关系。
  const subgraphs = {};      // { subgraphId: { nodes: {nodeId: true} } }
  const stack = [];          // 当前 subgraph id 栈（支持嵌套）
  const collectNodeIntoSubgraphs = (nid) => {
    if (!nid) return;
    for (const sid of stack) {
      if (!subgraphs[sid]) subgraphs[sid] = { nodes: {} };
      subgraphs[sid].nodes[nid] = true;
    }
  };

  for (const rawStmt of statements) {
    const stmt = rawStmt.trim();
    if (!stmt) continue;
    if (/^(graph|flowchart)\b/.test(stmt)) {
      continue;
    }
    const subM = /^subgraph\b\s*([A-Za-z0-9_\u00a0-\uffff.-]+)/.exec(stmt);
    if (subM) {
      stack.push(subM[1]);
      if (!subgraphs[subM[1]]) subgraphs[subM[1]] = { nodes: {} };
      continue;
    }
    if (/^end\b/.test(stmt)) {
      stack.pop();
      continue;
    }
    if (/^(style|classDef|class|click|linkStyle|direction)\b/.test(stmt)) {
      continue;
    }
    const parsedEdges = tryParseEdge(stmt);
    if (parsedEdges.length > 0) {
      for (const edge of parsedEdges) {
        nodes[edge[0]] = true;
        nodes[edge[1]] = true;
        edges.push(edge);
        collectNodeIntoSubgraphs(edge[0]);
        collectNodeIntoSubgraphs(edge[1]);
      }
    } else {
      // 不是边语句 → 尝试作为纯节点声明行（如 "A"、"B[text]"、"C{菱形}" 等），
      // 使 subgraph 内部的独立节点也能被正确关联。
      const nm = /^([A-Za-z][A-Za-z0-9_]*)/.exec(stmt);
      if (nm) {
        nodes[nm[1]] = true;
        collectNodeIntoSubgraphs(nm[1]);
      }
    }
  }

  return {
    isFlowchart: true,
    nodes: Object.keys(nodes),
    edges,
    subgraphs,
  };
}

/**
 * 创建一个可缩放、可交互高亮的 mermaid 图实例。
 * 仅在浏览器环境可用。
 *
 * @param {HTMLElement} container 目标容器元素
 * @param {string} mermaidText mermaid 文本
 * @param {object} [options] 可选配置
 *   - `customThemes` `<object>`：用户自定义配色方案，格式
 *     `{ [key]: { label, background, highlight, mermaid } }`
 * @returns {object} 控制句柄（含 render / zoom / highlight / destroy）
 */
function createDiagram(container, mermaidText, options) {
  if (!isBrowser()) {
    throw new Error(
      'createDiagram/renderToContainer 仅在浏览器环境可用；Node 环境请使用 renderMermaid。'
    );
  }
  if (!container || !container.appendChild) {
    throw new TypeError('createDiagram: container 必须是一个 DOM 元素。');
  }
  injectStyles();

  const cfg = Object.assign({}, options);

  // ---- 配色主题 ----
  // 实例级主题映射：内置主题 + 用户自定义主题（options.customThemes）
  // 自定义主题格式：{ [key]: { label, background, highlight, mermaid } }
  const instanceThemes = Object.assign({}, THEMES);
  if (cfg.customThemes && typeof cfg.customThemes === 'object') {
    Object.keys(cfg.customThemes).forEach((k) => {
      const t = cfg.customThemes[k];
      if (t && typeof t === 'object') {
        instanceThemes[k] = Object.assign({}, t, { key: k });
      }
    });
  }

  /** 在实例级主题映射中解析主题；未知 key 回退默认主题。 */
  function resolveInstanceTheme(key) {
    if (key && instanceThemes[key]) return instanceThemes[key];
    return instanceThemes[getDefaultThemeKey()];
  }

  // 是否根据系统/浏览器深浅色模式自动调整（options.autoTheme，默认关闭）
  const autoTheme = cfg.autoTheme === true;
  // 当前主题 key（默认取 options.theme 或默认主题；若 autoTheme 开启则按系统模式）
  let currentThemeKey = autoTheme
    ? getSystemThemeKey()
    : resolveInstanceTheme(cfg.theme).key;

  // 系统深浅色变化监听引用（供 destroy 时移除）
  let colorSchemeQuery = null;
  let colorSchemeListener = null;

  /** 根据系统/浏览器 prefers-color-scheme 返回 dark 或 light。 */
  function getSystemThemeKey() {
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function'
    ) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq && mq.matches) return 'dark';
    }
    return 'light';
  }

  /** 开启系统深浅色自动跟随：监听变化并重渲染。 */
  function enableAutoTheme() {
    if (!autoTheme) return;
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }
    try {
      colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    } catch (_) {
      return;
    }
    if (!colorSchemeQuery || typeof colorSchemeQuery.addEventListener !== 'function') {
      return;
    }
    colorSchemeListener = function () {
      const target = getSystemThemeKey();
      if (target !== currentThemeKey) {
        setTheme(target);
      }
    };
    colorSchemeQuery.addEventListener('change', colorSchemeListener);
  }

  // 构造传给 mermaid 的渲染配置：主题 mermaid 配置 + 用户自定义 mermaid 配置
  function buildMermaidConfig() {
    const theme = resolveInstanceTheme(currentThemeKey);
    const userMermaid =
      typeof cfg.mermaid === 'object' && cfg.mermaid !== null
        ? cfg.mermaid
        : {};
    return Object.assign({}, theme.mermaid, userMermaid);
  }

  /**
   * 应用当前主题配色。
   * - 背景色应用到整个容器 DOM（root，即传入的 container），通过内联样式覆盖页面样式；
   * - 高亮色通过容器上的 --mh-highlight 变量 + canvas 主题 class 生效。
   */
  function applyThemeClass() {
    const theme = resolveInstanceTheme(currentThemeKey);

    // 整个容器 DOM 的背景随主题变化
    root.style.background = theme.background;
    root.style.setProperty('--mh-highlight', theme.highlight);

    // canvas 上的主题 class 用于驱动高亮选择器（内置主题有对应 CSS class；
    // 自定义主题无 class，但 --mh-highlight 内联变量已生效）
    const canvas = getCanvas();
    if (canvas) {
      Object.keys(instanceThemes).forEach((k) => {
        canvas.classList.remove('mh-theme-' + k);
      });
      canvas.classList.add('mh-theme-' + theme.key);
    }

    if (cfg.onThemeChange) cfg.onThemeChange(currentThemeKey);
  }

  // ---- 缩放状态 ----
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 5;
  const ZOOM_STEP = 0.1;
  let zoomLevel = 1;
  // 画布平移偏移（以指针为中心缩放时用于保持锚点）
  let offsetX = 0;
  let offsetY = 0;
  // 是否允许直接鼠标滚轮缩放（可通过 options.enableScrollZoom 配置开关，默认开启）
  const enableScrollZoom = cfg.enableScrollZoom !== false;

  // ---- 图结构 ----
  let graphModel = null;
  let renderToken = 0;

  // 直接渲染到传入的容器 DOM。用 root 指向容器自身，所有渲染/查询都在容器内进行。
  const root = container;

  // ---- 渲染 ----
  async function render(text, renderOptions) {
    if (typeof text !== 'string' || text.trim() === '') {
      showMessage('等待渲染…');
      if (cfg.onRendered) cfg.onRendered(null);
      return null;
    }
    // 忽略开头的 YAML front-matter（`---` 包围的 id 等），保证高亮解析也一致
    text = stripFrontMatter(text);
    lastText = text;
    const token = ++renderToken;
    // 合并：主题的 mermaid 配置 + 用户配置 + 单次渲染覆盖，展开到顶层传给 mermaid。
    // buildMermaidConfig() 会覆盖 cfg.theme（用户指定的主题 key），
    // 因此最终传入 mermaid 的 theme 是各主题方案中的 mermaid theme（如 'base'）。
    const merged = Object.assign(
      {},
      cfg,
      renderOptions || {},
      buildMermaidConfig()
    );
    const svgText = await renderMermaid(text, merged);
    if (token !== renderToken) return null; // 已有更新请求，丢弃过期结果
    if (!root.isConnected) return null;

    resetZoom();
    // 渲染到传入的 DOM：清空容器并写入画布 + SVG
    root.innerHTML = '<div class="mermaid-highlighter-canvas">' + svgText + '</div>';
    applyThemeClass();
    setupHighlight(text);
    if (cfg.onRendered) cfg.onRendered(getSvg());
    return getSvg();
  }

  function showMessage(message, isError) {
    root.innerHTML =
      '<div class="' +
      (isError ? 'mermaid-highlighter-error' : 'mermaid-highlighter-empty') +
      '">' +
      escapeHtml(message) +
      '</div>';
    if (isError && cfg.onError) cfg.onError(message);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getSvg() {
    return root.querySelector('svg');
  }
  function getCanvas() {
    return root.querySelector('.mermaid-highlighter-canvas');
  }

  /**
   * 获取当前渲染 SVG 的字符串形式（含 XML 声明与命名空间，可直接保存为 .svg 文件）。
   * @returns {string|null} SVG 字符串；无渲染结果时返回 null
   */
  function getSvgString() {
    const svg = getSvg();
    if (!svg) return null;
    // 将当前高亮/主题等 class 状态固化为内联样式，保证独立文件正确显示。
    const clone = svg.cloneNode(true);
    inlineStylesForSvg(clone);
    applyBackgroundToSvg(clone);
    const serializer =
      typeof XMLSerializer !== 'undefined'
        ? new XMLSerializer()
        : null;
    const body = serializer
      ? serializer.serializeToString(clone)
      : (clone.outerHTML || '');
    // 仅当 <svg> 标签缺少 xmlns 时才补充，避免 xmlns 重复定义导致打开报错。
    let result = body;
    if (/<svg(?![^>]*\bxmlns=)/.test(result)) {
      result = result.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + result;
  }

  /**
   * 下载当前渲染的 SVG 图像。
   * @param {string} [filename] 文件名（默认 mermaid-diagram.svg）
   * @returns {boolean} 是否有内容可下载
   */
  function downloadSvg(filename) {
    const svgString = getSvgString();
    if (!svgString) return false;
    const name = filename || 'mermaid-diagram.svg';
    // 兼容 .svg 与 .svgz 的扩展名检查
    const finalName = /\.svgz?$/i.test(name) ? name : name + '.svg';
    downloadBlob(svgString, finalName, 'image/svg+xml;charset=utf-8');
    return true;
  }

  /**
   * 将 SVG 子树中依赖外部样式的 class 状态固化为内联 style。
   * 主要处理高亮（is-dimmed / is-relevant / is-active）产生的不透明度与灰度。
   */
  function inlineStylesForSvg(svgClone) {
    const dimmed = svgClone.classList.contains('is-dimmed');
    // 节点处理
    const nodes = svgClone.querySelectorAll('g.node');
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (dimmed && !n.classList.contains('is-relevant')) {
        n.style.opacity = '0.18';
        n.style.filter = 'grayscale(1)';
      } else if (n.classList.contains('is-relevant')) {
        n.style.opacity = '1';
      }
      if (n.classList.contains('is-active')) {
        const label = n.querySelector('.label-container');
        if (label) {
          label.style.filter =
            'drop-shadow(0 0 3px var(--mh-highlight, #2f81f7))';
        }
      }
    }
    // 连线处理
    const paths = svgClone.querySelectorAll('path.flowchart-link');
    for (let j = 0; j < paths.length; j++) {
      const p = paths[j];
      if (dimmed && !p.classList.contains('is-relevant')) {
        p.style.opacity = '0.18';
        p.style.filter = 'grayscale(1)';
      }
    }
    // 边的文本：与所在边保持一致
    const labels = svgClone.querySelectorAll('.edgeLabels .edgeLabel');
    for (let k = 0; k < labels.length; k++) {
      const l = labels[k];
      if (dimmed && !l.classList.contains('is-relevant')) {
        l.style.opacity = '0.18';
        l.style.filter = 'grayscale(1)';
      } else if (l.classList.contains('is-relevant')) {
        l.style.opacity = '1';
        l.style.filter = 'none';
        // 文字颜色继承 mermaid 默认（与节点文字一致），不写死
        const pEls = l.querySelectorAll('p');
        for (let t = 0; t < pEls.length; t++) {
          pEls[t].style.color = 'inherit';
        }
      }
    }
    // subgraph (cluster)：明暗与框内是否含相关节点关联
    const clusters = svgClone.querySelectorAll('g.cluster');
    for (let c = 0; c < clusters.length; c++) {
      const cluster = clusters[c];
      if (dimmed && !cluster.classList.contains('is-relevant')) {
        cluster.style.opacity = '0.18';
        cluster.style.filter = 'grayscale(1)';
      } else if (cluster.classList.contains('is-relevant')) {
        cluster.style.opacity = '1';
        cluster.style.filter = 'none';
        // cluster label 文字颜色继承，与节点一致
        const cls = cluster.querySelectorAll('.cluster-label p');
        for (let y = 0; y < cls.length; y++) {
          cls[y].style.color = 'inherit';
        }
      }
    }
  }

  /**
   * 在下载的 SVG 中插入一个与当前配色方案一致的背景 rect，
   * 使下载文件的背景与用户设置保持一致。
   */
  function applyBackgroundToSvg(svgClone) {
    const theme = resolveInstanceTheme(currentThemeKey);
    if (!theme || !theme.background) return;

    const ns = 'http://www.w3.org/2000/svg';
    const rect = document.createElementNS(ns, 'rect');

    // 优先根据 viewBox 确定尺寸，否则使用百分比覆盖整个视口
    const vb = svgClone.getAttribute('viewBox');
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        rect.setAttribute('x', parts[0]);
        rect.setAttribute('y', parts[1]);
        rect.setAttribute('width', parts[2]);
        rect.setAttribute('height', parts[3]);
      } else {
        rect.setAttribute('width', '100%');
        rect.setAttribute('height', '100%');
      }
    } else {
      rect.setAttribute('width', '100%');
      rect.setAttribute('height', '100%');
    }
    rect.setAttribute('fill', theme.background);
    rect.setAttribute('data-mh-background', 'true');

    // 背景 rect 置于最底层
    svgClone.insertBefore(rect, svgClone.firstChild);
  }

  /**
   * 通过 Blob + <a download> 触发浏览器下载。
   */
  function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 延迟释放对象 URL，避免下载被中断
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---- 缩放 ----
  /** 将当前缩放级别与偏移应用到画布 transform。 */
  function applyTransform() {
    const canvas = getCanvas();
    if (!canvas) return;
    canvas.style.transform =
      'translate(' + offsetX + 'px, ' + offsetY + 'px) scale(' + zoomLevel + ')';
    if (cfg.onZoomChange) cfg.onZoomChange(zoomLevel);
  }

  /** 设置缩放级别（以容器左上角为锚点）。 */
  function applyZoom(level) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
    if (next === zoomLevel) return zoomLevel;
    zoomLevel = next;
    applyTransform();
    return zoomLevel;
  }

  /**
   * 以指定指针位置为锚点缩放。
   * @param {number} nextLevel 目标缩放级别
   * @param {number} px 指针相对容器的 x（px）
   * @param {number} py 指针相对容器的 y（px）
   */
  function applyZoomAt(nextLevel, px, py) {
    const prev = zoomLevel;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextLevel));
    if (clamped === prev) return zoomLevel;
    // 保持指针下的内容点不动：
    //  内容点在画布坐标 (cx, cy) = ((px - offsetX)/prev, (py - offsetY)/prev)
    //  缩放后需 offsetX' = px - cx * clamped
    const ratio = clamped / prev;
    offsetX = px - ((px - offsetX) * ratio);
    offsetY = py - ((py - offsetY) * ratio);
    zoomLevel = clamped;
    applyTransform();
    return zoomLevel;
  }

  function setZoom(level) {
    return applyZoom(level);
  }
  function zoomIn() {
    return applyZoom(zoomLevel + ZOOM_STEP);
  }
  function zoomOut() {
    return applyZoom(zoomLevel - ZOOM_STEP);
  }
  function resetZoom() {
    zoomLevel = 1;
    offsetX = 0;
    offsetY = 0;
    applyTransform();
    return zoomLevel;
  }
  function getZoom() {
    return zoomLevel;
  }

  // ---- 高亮 ----
  function setupHighlight(text) {
    clearHighlight();
    const svg = getSvg();
    if (!svg) return;
    const graph = parseFlowchart(text);
    if (!graph.isFlowchart) {
      graphModel = null;
      return;
    }
    graphModel = graph;

    const nodeIdSet = {};
    graph.nodes.forEach((id) => {
      nodeIdSet[id] = true;
    });

    const nodeMap = {};
    const nodeEls = svg.querySelectorAll('g.node');
    for (let i = 0; i < nodeEls.length; i++) {
      const g = nodeEls[i];
      const gid = g.getAttribute('id') || '';
      const m = /flowchart-([\s\S]+)-(\d+)$/.exec(gid);
      if (!m) continue;
      const nodeId = m[1];
      if (!nodeIdSet[nodeId]) continue;
      if (!nodeMap[nodeId]) nodeMap[nodeId] = [];
      nodeMap[nodeId].push(g);
    }

    const edgePaths = [];
    const paths = svg.querySelectorAll('path[data-edge="true"]');
    for (let j = 0; j < paths.length; j++) {
      const p = paths[j];
      const did = p.getAttribute('data-id') || '';
      edgePaths.push({
        path: p,
        key: did.replace(/^L_/, '').replace(/_\d+$/, ''),
        raw: did,
      });
    }

    graphModel.nodeMap = nodeMap;
    graphModel.edgePaths = edgePaths;

    svg.removeEventListener('click', handleNodeClick);
    svg.addEventListener('click', handleNodeClick);
  }

  function handleNodeClick(e) {
    if (!graphModel) return;
    const g = e.target.closest
      ? e.target.closest('g.node')
      : findAncestorNode(e.target);
    if (!g) {
      clearHighlight();
      return;
    }
    const gid = g.getAttribute('id') || '';
    const m = /flowchart-([\s\S]+)-(\d+)$/.exec(gid);
    if (!m) return;
    const clickedNode = m[1];

    const svg = getSvg();
    if (svg && svg.classList.contains('is-dimmed') && g.classList.contains('is-active')) {
      clearHighlight();
      return;
    }
    highlightFrom(clickedNode);
  }

  function findAncestorNode(el) {
    while (el && el.tagName !== 'SVG') {
      if (
        el.getAttribute &&
        (el.getAttribute('class') || '').split(/\s+/).indexOf('node') !== -1
      ) {
        return el;
      }
      el = el.parentNode;
    }
    return null;
  }

  function highlightFrom(startNodeId) {
    clearHighlight();
    const graph = graphModel;

    const outAdj = {};
    const inAdj = {};
    const edgeMap = {};
    graph.edges.forEach((e) => {
      const s = e[0];
      const t = e[1];
      if (!outAdj[s]) outAdj[s] = [];
      outAdj[s].push(t);
      if (!inAdj[t]) inAdj[t] = [];
      inAdj[t].push(s);
      edgeMap[s + '>' + t] = true;
    });

    const relevantNodes = {};
    const relevantEdges = {};

    const visitedUp = {};
    const queueUp = [startNodeId];
    visitedUp[startNodeId] = true;
    while (queueUp.length) {
      const cur = queueUp.shift();
      const ups = inAdj[cur] || [];
      for (const src of ups) {
        if (!visitedUp[src]) {
          visitedUp[src] = true;
          queueUp.push(src);
        }
        if (edgeMap[src + '>' + cur]) relevantEdges[src + '>' + cur] = true;
      }
    }

    const visitedDown = {};
    const queueDown = [startNodeId];
    visitedDown[startNodeId] = true;
    while (queueDown.length) {
      const cur2 = queueDown.shift();
      const downs = outAdj[cur2] || [];
      for (const tgt of downs) {
        if (edgeMap[cur2 + '>' + tgt]) relevantEdges[cur2 + '>' + tgt] = true;
        if (!visitedDown[tgt]) {
          visitedDown[tgt] = true;
          queueDown.push(tgt);
        }
      }
    }

    const allVisited = {};
    Object.keys(visitedUp).forEach((k) => (allVisited[k] = true));
    Object.keys(visitedDown).forEach((k) => (allVisited[k] = true));
    Object.keys(relevantEdges).forEach((k) => {
      const parts = k.split('>');
      allVisited[parts[0]] = true;
      allVisited[parts[1]] = true;
    });
    Object.keys(allVisited).forEach((nid) => (relevantNodes[nid] = true));

    applyHighlight(graph, startNodeId, relevantNodes, relevantEdges);
  }

  function applyHighlight(graph, activeNode, relevantNodes, relevantEdges) {
    const svg = getSvg();
    if (!svg) return;
    svg.classList.add('is-dimmed');

    const nodeEls = svg.querySelectorAll('g.node');
    for (let i = 0; i < nodeEls.length; i++) {
      const g = nodeEls[i];
      const m = /flowchart-([\s\S]+)-(\d+)$/.exec(g.getAttribute('id') || '');
      if (!m) continue;
      const nid = m[1];
      if (relevantNodes[nid]) {
        g.classList.add('is-relevant');
        if (nid === activeNode) g.classList.add('is-active');
      }
    }

    const relevantEdgeKeys = {};
    Object.keys(relevantEdges).forEach((key) => {
      const parts = key.split('>');
      relevantEdgeKeys[parts[0] + '_' + parts[1]] = true;
    });
    graph.edgePaths.forEach((ep) => {
      if (relevantEdgeKeys[ep.key]) ep.path.classList.add('is-relevant');
    });

    // 边的文本：明暗程度与所在边保持一致。
    // 关联方式：mermaid 生成的边文本结构为 <g class="edgeLabel"><g class="label"
    // data-id="L_B_C_0">...</g></g>，其中 data-id 与边路径的 data-id 完全一致，
    // 归一化后（B_C）与相关边 key 比对即可判定该边文本是否属于相关边。
    // 注意：mermaid 边文本结构里，外层是 SVG <g class="edgeLabel">，其内部
    // （foreignObject 中）还有一个 HTML <span class="edgeLabel">。两者都会被
    // '.edgeLabels .edgeLabel' 选中。外层 g 有 [data-id] 可用于判定相关性；
    // 内部 span 没有 [data-id]，必须跟随外层一起标记 is-relevant，
    // 否则会被 :not(.is-relevant) 规则误判为无关文本而变灰。
    const labels = svg.querySelectorAll('.edgeLabels > g.edgeLabel');
    for (let k = 0; k < labels.length; k++) {
      const label = labels[k];
      const dataId = label.querySelector('[data-id]');
      if (!dataId) continue;
      const lk = edgeLabelKey(dataId.getAttribute('data-id'));
      if (lk && relevantEdgeKeys[lk]) {
        label.classList.add('is-relevant');
        // 同步标记该标签块内部的所有 edgeLabel（含 HTML span），避免被灰化
        const innerLabels = label.querySelectorAll('[class*="edgeLabel"]');
        for (let x = 0; x < innerLabels.length; x++) {
          innerLabels[x].classList.add('is-relevant');
        }
      }
    }

    // subgraph (cluster)：若 cluster 对应的 subgraph 内存在相关节点（被高亮或其
    // 相关上下游），则 cluster 及其 label 保持正常亮度；否则整体下沉变暗。
    // 注意：渲染出的 SVG 中 cluster 与 node 是平级 group（cluster 不包含 node），
    // 无法通过 DOM 包含关系判断，只能借助文本解析出的 subgraph → 节点映射来判定。
    const subgraphById = graph.subgraphs || {};
    // 【调试】输出 subgraph-节点映射、cluster id、relevantNodes，便于排查高亮问题
    try {
      /* eslint-disable no-console */
      console.log('[MH-debug] subgraphById =', JSON.stringify(subgraphById, null, 2));
      console.log('[MH-debug] relevantNodes =', JSON.stringify(relevantNodes));
      console.log('[MH-debug] relevantEdges =', JSON.stringify(relevantEdges));
      /* eslint-enable no-console */
    } catch (_) { /* 忽略日志异常 */ }
    const clusters = svg.querySelectorAll('g.cluster');
    for (let c = 0; c < clusters.length; c++) {
      const cluster = clusters[c];
      const cid = cluster.getAttribute('id') || '';
      // 找到与该 cluster 匹配的 subgraph id（cluster id 以 -<subgraphId> 结尾）
      const sid = matchSubgraphId(cid, subgraphById);
      try {
        /* eslint-disable no-console */
        console.log('[MH-debug] cluster id="' + cid + '" -> matched subgraph="' + sid + '"');
        /* eslint-enable no-console */
      } catch (_) {}
      if (!sid) continue;
      const sg = subgraphById[sid];
      let hasRelevant = false;
      for (const nid in sg.nodes) {
        if (relevantNodes[nid]) { hasRelevant = true; break; }
      }
      try {
        /* eslint-disable no-console */
        console.log('[MH-debug] subgraph "' + sid + '" nodes =', JSON.stringify(sg.nodes), '-> hasRelevant =', hasRelevant);
        /* eslint-enable no-console */
      } catch (_) {}
      if (hasRelevant) {
        cluster.classList.add('is-relevant');
        // 同步标记 cluster 内所有 cluster-label（含 HTML span），避免被灰化
        const innerLabels = cluster.querySelectorAll('[class*="cluster-label"]');
        for (let x = 0; x < innerLabels.length; x++) {
          innerLabels[x].classList.add('is-relevant');
        }
      }
    }
  }

  // 从 cluster 元素的 id（形如 <svgId>-<subgraphId>）中，找出对应的 subgraph id。
  // 用最长匹配避免 subgraph id 互为前缀时误判。
  function matchSubgraphId(clusterId, subgraphById) {
    let best = '';
    for (const sid in subgraphById) {
      if (clusterId === sid || clusterId.endsWith('-' + sid)) {
        if (sid.length > best.length) best = sid;
      }
    }
    return best;
  }

  // 将 mermaid 边文本 / 边路径的 data-id（如 L_B_C_0）归一化为边 key 格式：
  // 去掉 L_ 前缀与尾部 _数字，得到 B_C（与 ep.key 一致）。
  function edgeLabelKey(id) {
    let k = String(id || '').replace(/^L_/i, '');
    k = k.replace(/_\d+$/, '');
    return k;
  }

  /** 清除所有高亮状态。 */
  function clearHighlight() {
    const svg = getSvg();
    if (!svg) return;
    svg.classList.remove('is-dimmed');
    const nodeEls = svg.querySelectorAll('g.node');
    for (let i = 0; i < nodeEls.length; i++) {
      nodeEls[i].classList.remove('is-relevant', 'is-active');
    }
    const paths = svg.querySelectorAll('path.is-relevant');
    for (let j = 0; j < paths.length; j++) {
      paths[j].classList.remove('is-relevant');
    }
    const labels = svg.querySelectorAll('.edgeLabel.is-relevant');
    for (let k = 0; k < labels.length; k++) {
      labels[k].classList.remove('is-relevant');
    }
    // 清除 subgraph (cluster) 及其 label 的高亮状态
    const clusters = svg.querySelectorAll('g.cluster.is-relevant');
    for (let c = 0; c < clusters.length; c++) {
      clusters[c].classList.remove('is-relevant');
    }
    const clusterLabels = svg.querySelectorAll('.cluster-label.is-relevant');
    for (let cl = 0; cl < clusterLabels.length; cl++) {
      clusterLabels[cl].classList.remove('is-relevant');
    }
  }

  /** 对外高亮指定节点（按文本节点 id）。 */
  function highlightNode(nodeId) {
    if (!graphModel) return false;
    const svg = getSvg();
    if (!svg) return false;
    if (typeof nodeId !== 'string' || !nodeId) {
      clearHighlight();
      return false;
    }
    highlightFrom(nodeId);
    return true;
  }

  // ---- 配色主题控制 ----
  /** 返回当前主题 key。 */
  function getTheme() {
    return currentThemeKey;
  }

  /** 返回所有可用主题（含 label / key / background）。 */
  function getThemes() {
    return Object.keys(instanceThemes).map((k) => ({
      key: instanceThemes[k].key,
      label: instanceThemes[k].label,
      background: instanceThemes[k].background,
    }));
  }

  /** 记录当前渲染文本（供 setTheme 重渲染使用）。 */
  let lastText = typeof mermaidText === 'string' ? mermaidText : '';

  /** 切换到指定主题并重新渲染。 */
  async function setTheme(themeKey, renderOptions) {
    const resolved = resolveInstanceTheme(themeKey);
    if (resolved.key !== currentThemeKey) {
      currentThemeKey = resolved.key;
    }
    // 重新渲染以应用新配色
    return render(lastText, renderOptions);
  }

  // ---- 缩放交互事件 ----
  /**
   * 鼠标滚轮直接缩放（以指针所在位置为中心）。
   * 可通过 options.enableScrollZoom 配置开关（默认开启）。
   */
  function onPreviewWheel(e) {
    if (!enableScrollZoom) return;
    // 直接滚轮缩放；若用户按住 Ctrl/⌘，浏览器页面缩放由浏览器接管，这里不做处理。
    e.preventDefault();

    // 计算指针相对容器的位置
    const rect = root.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP;
    applyZoomAt(zoomLevel * factor, px, py);
  }

  // ---- 销毁 ----
  function destroy() {
    renderToken++; // 使进行中的异步渲染失效
    const svg = getSvg();
    if (svg) {
      svg.removeEventListener('click', handleNodeClick);
    }
    root.removeEventListener('wheel', onPreviewWheel);
    // 移除系统深浅色监听
    if (colorSchemeQuery && colorSchemeListener) {
      try {
        colorSchemeQuery.removeEventListener('change', colorSchemeListener);
      } catch (_) {
        /* ignore */
      }
      colorSchemeQuery = null;
      colorSchemeListener = null;
    }
    // 仅清空容器内容与实例状态，不删除传入的容器 DOM。
    root.innerHTML = '';
    graphModel = null;
  }

  // 绑定容器级滚轮缩放
  root.addEventListener('wheel', onPreviewWheel, { passive: false });

  // 初始渲染
  if (typeof mermaidText === 'string') {
    render(mermaidText).catch((err) => {
      console.error(err);
      showMessage(err && err.message ? err.message : String(err), true);
    });
  }

  // 开启系统/浏览器深浅色自动跟随（若启用）
  enableAutoTheme();

  return {
    root,
    render,
    update: render, // 别名
    getSvg,
    getSvgString,
    downloadSvg,
    getZoom,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    highlightNode,
    clearHighlight,
    getTheme,
    setTheme,
    getThemes,
    destroy,
  };
}

/**
 * 在指定容器内渲染一个可缩放、可交互高亮的 mermaid 图（浏览器环境）。
 * 任意 HTML 页面引用本脚本后即可使用。
 *
 * 注意：本方法同步返回控制句柄；内部会自动触发初始异步渲染。
 * 如需等待首次渲染完成，可通过句柄的 `render()` 返回的 Promise 或
 * `onRendered` 回调感知。
 *
 * @param {HTMLElement} container 目标容器元素
 * @param {string} mermaidText mermaid 文本
 * @param {object} [options] 可选配置
 *   - `enableScrollZoom` `<boolean>`：是否允许鼠标滚轮直接缩放
 *     （以指针位置为中心），默认 `true`；设为 `false` 可关闭
 *   - `autoTheme` `<boolean>`：是否根据系统/浏览器深浅色模式自动切换
 *     深色/浅色主题，默认 `false`；设为 `true` 开启，系统模式变化时自动跟随
 *   - `customThemes` `<object>`：用户自定义配色方案，格式
 *     `{ [key]: { label, background, highlight, mermaid } }`，
 *     会合并进内置主题，可通过 `theme` / `setTheme(key)` 使用
 *   - `onZoomChange(level)` / `onRendered(svg)` / `onError(message)` 等回调
 * @returns {object} 控制句柄（含 render / zoom / highlight / destroy 等）
 */
function renderToContainer(container, mermaidText, options) {
  if (!isBrowser()) {
    throw new Error(
      'renderToContainer 仅在浏览器环境可用；Node 环境请使用 renderMermaid。'
    );
  }
  return createDiagram(container, mermaidText, options);
}

/* ============================================================
 * 导出
 * ============================================================ */

const api = {
  isBrowser,
  renderMermaid,
  renderToContainer,
  createDiagram,
  parseFlowchart,
};

// 兼容 CommonJS（Node）与浏览器全局（<script>）两种方式。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (isBrowser()) {
  window.MermaidHighlighter = api;
}
