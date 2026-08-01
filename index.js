'use strict';

/**
 * 判断当前是否运行在浏览器环境中。
 * 浏览器直接使用全局 `document` 渲染，无需 jsdom。
 *
 * @returns {boolean}
 */
function isBrowser() {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

/**
 * 懒加载 mermaid 库。
 * 浏览器环境：从全局 `window.mermaid` 获取（由 vendor/mermaid 提供）。
 * Node 环境：通过 require 引入 node_modules 中的 mermaid。
 *
 * @returns {Promise<object>} mermaid 模块对象
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

  // Node.js（服务端）环境
  try {
    const mermaid = require('mermaid');
    // mermaid v11 的 CJS 入口为 ESM 转译产物，真实 API 挂载在 `.default`。
    return mermaid && mermaid.default ? mermaid.default : mermaid;
  } catch (err) {
    throw new Error(
      '无法加载 mermaid 库。请先在项目目录执行 `npm install mermaid`。'
    );
  }
}

/**
 * 在 Node.js（服务端）环境中，通过 jsdom 创建一个隔离的 DOM 环境，
 * 使 mermaid 能够像在浏览器中一样完成渲染。
 *
 * @returns {Promise<{dom, mermaid}>} 包含 DOM 环境和 mermaid 实例的对象
 */
async function createNodeDom() {
  const { JSDOM } = require('jsdom');

  const dom = new JSDOM(
    '<!DOCTYPE html><html><body></body></html>',
    { url: 'http://localhost/' }
  );

  // mermaid 依赖 window/document 等全局对象，需要注入到 Node 全局。
  // 部分全局属性（如 navigator）在 Node 中是只读 getter，需用 defineProperty 覆盖。
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
  // mermaid 渲染 SVG 时依赖以下全局类。
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

  // jsdom 未实现 SVG 元素的几何测量方法（getBBox 等），mermaid 依赖它们。
  // 这里注入简单 polyfill，返回固定尺寸以完成布局计算。
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

  // mermaid 内部通过 require 或全局引用解析 document，
  // 加载时需确保全局对象已就绪。
  const rawMermaid = require('mermaid');
  // mermaid v11 的 CJS 入口为 ESM 转译产物，真实 API 挂载在 `.default`。
  const mermaid = rawMermaid && rawMermaid.default ? rawMermaid.default : rawMermaid;

  return { dom, mermaid, injectedKeys };
}

/**
 * 将传入的 mermaid 文本渲染为 SVG 字符串。
 *
 * @param {string} mermaidText mermaid 语法文本（必填，非空）
 * @param {object} [options] 可选，mermaid 初始化配置（如 { theme: 'dark' }）
 * @returns {Promise<string>} 渲染后的完整 SVG 字符串
 * @throws {TypeError} 当 mermaidText 缺失或非字符串时抛出
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
    // 每次渲染前重置，避免多次初始化导致的配置残留。
    if (mermaid.initialize) {
      mermaid.initialize({
        startOnLoad: false,
        ...options,
      });
    }

    const result = await mermaid.render('mermaid-svg', mermaidText);
    // 浏览器环境返回 SVG 字符串；Node + jsdom 环境返回 { svg, ... } 对象。
    // 统一归一化为字符串。
    if (typeof result === 'string') {
      return result;
    }
    if (result && typeof result.svg === 'string') {
      return result.svg;
    }
    throw new Error('renderMermaid: mermaid.render 返回了无法识别的结果。');
  } finally {
    // Node 环境下渲染完成后清理全局对象，避免影响同进程内其他代码。
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

module.exports = { renderMermaid };
