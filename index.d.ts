/**
 * mermaid-highlighter 类型声明。
 */

/** 一个配色方案定义。 */
export interface MermaidTheme {
  /** 主题标识（key）。 */
  key: string;
  /** 显示名称。 */
  label: string;
  /** 容器 DOM 背景色。 */
  background: string;
  /** 节点高亮发光色。 */
  highlight: string;
  /** 传给 mermaid 的初始化配置（theme + themeVariables）。 */
  mermaid: Record<string, unknown>;
}

/** 用户自定义配色方案集合。 */
export type CustomThemes = Record<
  string,
  Omit<MermaidTheme, 'key'>
>;

/** renderToContainer / createDiagram 的选项。 */
export interface RenderOptions {
  /** 配色方案 key（默认 'light'）。 */
  theme?: string;
  /** 用户自定义配色方案。 */
  customThemes?: CustomThemes;
  /** 是否根据系统深浅色模式自动切换深色/浅色主题（默认 false）。 */
  autoTheme?: boolean;
  /** 是否允许鼠标滚轮直接缩放（以指针为中心，默认 true）。 */
  enableScrollZoom?: boolean;
  /** 是否允许按住鼠标左键拖动画布以平移视口（默认 true，放大后便于查看不同区域）。 */
  enableDragPan?: boolean;
  /** mermaid 构建加载路径（默认 vendor/mermaid/mermaid.min.js）。 */
  mermaidUrl?: string;
  /** 额外的 mermaid 初始化配置（合并进主题配置）。 */
  mermaid?: Record<string, unknown>;
  /** 缩放比例变化回调。 */
  onZoomChange?: (level: number) => void;
  /** 渲染完成回调。 */
  onRendered?: (svg: SVGSVGElement | null) => void;
  /** 渲染出错回调。 */
  onError?: (message: string) => void;
  /** 配色变化回调。 */
  onThemeChange?: (key: string) => void;
}

/** 控制句柄。 */
export interface DiagramHandle {
  /** 根容器 DOM 元素。 */
  root: HTMLElement;
  /** 重新渲染。 */
  render(text: string, renderOptions?: RenderOptions): Promise<SVGSVGElement | null>;
  /** 重新渲染（render 的别名）。 */
  update(text: string, renderOptions?: RenderOptions): Promise<SVGSVGElement | null>;
  /** 获取当前 SVG 元素。 */
  getSvg(): SVGSVGElement | null;
  /** 获取当前 SVG 字符串（含 XML 声明与命名空间）。 */
  getSvgString(): string | null;
  /** 下载当前 SVG 图像。 */
  downloadSvg(filename?: string): boolean;
  /** 获取当前缩放级别。 */
  getZoom(): number;
  /** 设置缩放级别。 */
  setZoom(level: number): number;
  /** 放大。 */
  zoomIn(): number;
  /** 缩小。 */
  zoomOut(): number;
  /** 重置缩放为 100%。 */
  resetZoom(): number;
  /** 高亮指定节点（及其上下游）。 */
  highlightNode(nodeId: string): boolean;
  /** 清除高亮。 */
  clearHighlight(): void;
  /** 获取当前主题 key。 */
  getTheme(): string;
  /** 切换到指定主题并重渲染。 */
  setTheme(themeKey: string, renderOptions?: RenderOptions): Promise<SVGSVGElement | null>;
  /** 获取所有可用主题。 */
  getThemes(): Array<{ key: string; label: string; background: string }>;
  /** 销毁实例并清理。 */
  destroy(): void;
}

/** parseFlowchart 的返回结构。 */
export interface FlowchartGraph {
  isFlowchart: boolean;
  nodes: string[];
  edges: Array<[string, string]>;
}

/** 在浏览器指定容器内渲染可缩放、可交互高亮的 mermaid 图。 */
export function renderToContainer(
  container: HTMLElement,
  mermaidText: string,
  options?: RenderOptions
): DiagramHandle;

/** 创建图表实例（renderToContainer 的同构函数）。 */
export function createDiagram(
  container: HTMLElement,
  mermaidText: string,
  options?: RenderOptions
): DiagramHandle;

/** 将 mermaid 文本渲染为 SVG 字符串（Node 与浏览器通用）。 */
export function renderMermaid(
  mermaidText: string,
  options?: RenderOptions & { mermaidUrl?: string }
): Promise<string>;

/** 判断当前是否运行在浏览器环境。 */
export function isBrowser(): boolean;

/** 解析 mermaid flowchart 文本，提取节点与边。 */
export function parseFlowchart(text: string): FlowchartGraph;

declare const _default: {
  isBrowser: typeof isBrowser;
  renderMermaid: typeof renderMermaid;
  renderToContainer: typeof renderToContainer;
  createDiagram: typeof createDiagram;
  parseFlowchart: typeof parseFlowchart;
};
export default _default;
