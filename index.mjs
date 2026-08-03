/**
 * mermaid-highlighter 的 ESM 入口。
 *
 * 复用 CommonJS 实现，并以命名导出的方式提供给 ESM 使用：
 *   import { renderMermaid, renderToContainer } from 'mermaid-highlighter';
 *
 * 注意：`renderToContainer` / `createDiagram` 仅浏览器环境可用，
 * Node 环境请使用 `renderMermaid`。
 */
import module from './index.js';

const {
  isBrowser,
  renderMermaid,
  renderToContainer,
  createDiagram,
  parseFlowchart,
} = module;

export {
  isBrowser,
  renderMermaid,
  renderToContainer,
  createDiagram,
  parseFlowchart,
};

export default module;
