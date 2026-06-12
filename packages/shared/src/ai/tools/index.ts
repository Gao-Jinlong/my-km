/**
 * 工具 Schema 定义 — 前后端共享单一数据源
 *
 * 这些 schema 发送给 LLM，用于 tool call 协议。
 * 前端同时包含执行逻辑（FrontendToolExecutor），后端仅使用 schema 定义。
 */

export { fileOpsTool } from './file-ops';
export { docReadTool } from './doc-read';
export { docEditTool } from './doc-edit';
export { searchTool } from './search';
