'use strict';

const assert = require('assert');
const path = require('path');

const M = require('../index.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed++;
    console.error('  ✗ ' + name);
    console.error('    ' + (err && err.message ? err.message : err));
  }
}

console.log('mermaid-highlighter tests\n');

test('导出包含全部公开 API', () => {
  for (const k of [
    'isBrowser',
    'renderMermaid',
    'renderToContainer',
    'createDiagram',
    'parseFlowchart',
  ]) {
    assert.strictEqual(typeof M[k], 'function', '缺少导出: ' + k);
  }
});

test('isBrowser 在 Node 环境为 false', () => {
  assert.strictEqual(M.isBrowser(), false);
});

test('renderToContainer 在 Node 环境应抛错', () => {
  assert.throws(() => M.renderToContainer({}, 'graph TD; A-->B;'), /浏览器/);
});

test('renderMermaid 对空文本抛 TypeError', async () => {
  await assert.rejects(() => M.renderMermaid(''), TypeError);
});

test('parseFlowchart 解析基本边', () => {
  const g = M.parseFlowchart('graph TD\n A --> B\n B --> C\n');
  assert.strictEqual(g.isFlowchart, true);
  assert.deepStrictEqual(g.nodes.sort(), ['A', 'B', 'C']);
  assert.deepStrictEqual(g.edges.map((e) => e.join('>')).sort(), ['A>B', 'B>C']);
});

test('parseFlowchart 解析链式边', () => {
  const g = M.parseFlowchart('graph TD\n D --> C --> E\n');
  assert.deepStrictEqual(g.edges.map((e) => e.join('>')).sort(), ['C>E', 'D>C']);
});

test('parseFlowchart 解析连线注释', () => {
  const g = M.parseFlowchart('graph TD\n A -- yes --> B\n');
  assert.deepStrictEqual(g.edges.map((e) => e.join('>')), ['A>B']);
});

test('parseFlowchart 识别非 flowchart 返回 isFlowchart=false', () => {
  assert.strictEqual(M.parseFlowchart('sequenceDiagram\n A->>B: hi').isFlowchart, false);
});

test('renderMermaid 在 Node 渲染出 SVG 字符串', async () => {
  const svg = await M.renderMermaid('graph TD; A --> B;');
  assert.strictEqual(typeof svg, 'string');
  assert.ok(svg.includes('<svg'), '返回应为 SVG 字符串');
});

test('parseFlowchart 忽略开头的 YAML front-matter', () => {
  const g = M.parseFlowchart(
    '---\nid: 9D913C38-4409-4194-99C8-2F6141BC30FB\n---\ngraph TD\n A --> B\n'
  );
  assert.strictEqual(g.isFlowchart, true);
  assert.deepStrictEqual(g.nodes.sort(), ['A', 'B']);
});

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
