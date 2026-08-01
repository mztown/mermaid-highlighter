'use strict';

/**
 * mermaid-highlighter
 *
 * 将 mermaid 文本渲染为 SVG 的独立模块，并提供：
 *  - 缩放（滚轮 / 按钮 / 键盘）
 *  - 点击节点高亮上游/下游
 * 两种能力。支持 CommonJS（Node）与浏览器 <script> 全局两种用法。
 *
 * 用法一：Node.js
 *   const { renderMermaid, renderToContainer } = require('mermaid-highlighter');
 *   const svg = await renderMermaid('graph TD; A-->B;');
 *
 * 用法二：浏览器
 *   <script src="vendor/mermaid/mermaid.min.js"></script>
 *   <script src="index.js"></script>
 *   <script>
 *     const diagram = MermaidHighlighter.renderToContainer(
 *       document.getElementById('container'),
 *       'graph TD; A-->B; B-->C;'
 *     );
 *   </script>
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

/**
 * 懒加载 mermaid 库。
 * 浏览器：从全局 `window.mermaid` 获取（由 vendor/mermaid 提供）。
 * Node：require('mermaid')。
 * @returns {Promise<object>}
 */
async function loadMermaid() {
  if (isBrowser()) {
    if (typeof window.mermaid !== 'undefined') {
      return window.mermaid;
    }
    throw new Error(
      '未找到 mermaid 实例。请确保已引入 mermaid 并挂载到 window.mermaid。'
    );
  }

  try {
    const mermaid = require('mermaid');
    // mermaid v11 的 CJS 入口为 ESM 转译产物，真实 API 挂在 `.default`。
    return mermaid && mermaid.default ? mermaid.default : mermaid;
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

  const rawMermaid = require('mermaid');
  const mermaid =
    rawMermaid && rawMermaid.default ? rawMermaid.default : rawMermaid;

  return { dom, mermaid, injectedKeys };
}

/**
 * 将传入的 mermaid 文本渲染为 SVG 字符串（Node 与浏览器通用）。
 *
 * @param {string} mermaidText mermaid 语法文本（必填，非空）
 * @param {object} [options] 可选，mermaid 初始化配置
 * @returns {Promise<string>} 渲染后的完整 SVG 字符串
 * @throws {TypeError} mermaidText 缺失或非字符串时抛出
 */
async function renderMermaid(mermaidText, options = {}) {
  if (typeof mermaidText !== 'string' || mermaidText.trim() === '') {
    throw new TypeError('renderMermaid: mermaidText 必须是非空字符串。');
  }

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
    mermaid = await loadMermaid();
  }

  try {
    if (mermaid.initialize) {
      mermaid.initialize({ startOnLoad: false, ...options });
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

// 模块所需的样式（通过 <style> 自动注入，无需页面额外 CSS）
const MODULE_CSS = `
  .mermaid-highlighter-canvas {
    display: block;
    transform-origin: 0 0;
    transition: transform 0.15s ease;
  }
  .mermaid-highlighter-root svg .node {
    cursor: pointer;
    transition: opacity 0.2s ease;
  }
  .mermaid-highlighter-root svg .node.is-active .label-container {
    filter: drop-shadow(0 0 3px rgba(47, 129, 247, 0.9));
  }
  .mermaid-highlighter-root svg .node.is-active {
    opacity: 1;
  }
  .mermaid-highlighter-root svg.is-dimmed .node:not(.is-relevant),
  .mermaid-highlighter-root svg.is-dimmed .edgePaths .flowchart-link:not(.is-relevant) {
    opacity: 0.18;
    filter: grayscale(1);
  }
  .mermaid-highlighter-root svg.is-dimmed .node.is-relevant,
  .mermaid-highlighter-root svg.is-dimmed .edgePaths .flowchart-link.is-relevant {
    opacity: 1;
    filter: none;
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

  for (const rawStmt of statements) {
    const stmt = rawStmt.trim();
    if (!stmt) continue;
    if (
      /^(graph|flowchart)\b/.test(stmt) ||
      /^subgraph\b/.test(stmt) ||
      /^end\b/.test(stmt) ||
      /^(style|classDef|class|click|linkStyle|direction)\b/.test(stmt)
    ) {
      continue;
    }
    for (const edge of tryParseEdge(stmt)) {
      nodes[edge[0]] = true;
      nodes[edge[1]] = true;
      edges.push(edge);
    }
  }

  return { isFlowchart: true, nodes: Object.keys(nodes), edges };
}

/**
 * 创建一个可缩放、可交互高亮的 mermaid 图实例。
 * 仅在浏览器环境可用。
 *
 * @param {HTMLElement} container 目标容器元素
 * @param {string} mermaidText mermaid 文本
 * @param {object} [options] 可选配置
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

  // ---- 缩放状态 ----
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 5;
  const ZOOM_STEP = 0.1;
  let zoomLevel = 1;

  // ---- 图结构 ----
  let graphModel = null;
  let renderToken = 0;

  // 容器的根包装元素
  const root = document.createElement('div');
  root.className = 'mermaid-highlighter-root';
  container.appendChild(root);

  // ---- 渲染 ----
  async function render(text, renderOptions) {
    if (typeof text !== 'string' || text.trim() === '') {
      showMessage('等待渲染…');
      if (cfg.onRendered) cfg.onRendered(null);
      return null;
    }
    const token = ++renderToken;
    const svgText = await renderMermaid(text, renderOptions || cfg.mermaid);
    if (token !== renderToken) return null; // 已有更新请求，丢弃过期结果
    if (!root.isConnected) return null;

    resetZoom();
    root.innerHTML = '<div class="mermaid-highlighter-canvas">' + svgText + '</div>';
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

  // ---- 缩放 ----
  function applyZoom(level) {
    zoomLevel = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
    const canvas = getCanvas();
    if (canvas) canvas.style.transform = 'scale(' + zoomLevel + ')';
    if (cfg.onZoomChange) cfg.onZoomChange(zoomLevel);
  }
  function setZoom(level) {
    applyZoom(level);
    return zoomLevel;
  }
  function zoomIn() {
    applyZoom(zoomLevel + ZOOM_STEP);
  }
  function zoomOut() {
    applyZoom(zoomLevel - ZOOM_STEP);
  }
  function resetZoom() {
    applyZoom(1);
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

  // ---- 缩放交互事件 ----
  function onPreviewWheel(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  }

  // ---- 销毁 ----
  function destroy() {
    renderToken++; // 使进行中的异步渲染失效
    const svg = getSvg();
    if (svg) {
      svg.removeEventListener('click', handleNodeClick);
    }
    root.removeEventListener('wheel', onPreviewWheel);
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  // 绑定容器级滚轮缩放（Ctrl/⌘ + 滚轮）
  root.addEventListener('wheel', onPreviewWheel, { passive: false });

  // 初始渲染
  if (typeof mermaidText === 'string') {
    render(mermaidText).catch((err) => {
      console.error(err);
      showMessage(err && err.message ? err.message : String(err), true);
    });
  }

  return {
    root,
    render,
    update: render, // 别名
    getSvg,
    getZoom,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    highlightNode,
    clearHighlight,
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
 * @param {object} [options] 可选配置 { onZoomChange, onRendered, onError }
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
