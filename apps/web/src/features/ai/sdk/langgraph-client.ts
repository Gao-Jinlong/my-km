/**
 * LangGraph SDK Client
 *
 * 初始化 @langchain/langgraph-sdk 的 Client，连接后端 LangGraph 协议兼容 API。
 *
 * 后端 routes（注册在 /api 全局前缀下）：
 *   POST   /api/threads
 *   POST   /api/threads/search
 *   GET    /api/threads/:id
 *   PATCH  /api/threads/:id
 *   DELETE /api/threads/:id
 *   GET    /api/threads/:id/state
 *   POST   /api/threads/:id/runs/stream
 *   POST   /api/threads/:id/runs/:rid/cancel
 *
 * SDK Client 通过 apiUrl 配置基地址，自动拼接上述路径。
 */

import { Client } from '@langchain/langgraph-sdk';

const API_URL = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL ?? 'http://localhost:3000/api';

/**
 * 全局 SDK Client 单例。
 *
 * 用于 thread CRUD（client.threads.*）和 run 流式调用（client.runs.stream）。
 * useStream hook 也可以通过 client 参数直接复用此实例。
 */
export const langgraphClient = new Client({
    apiUrl: API_URL,
});

/**
 * 当前 LangGraph API URL（供 useStream 等 hook 直接使用）
 */
export const LANGGRAPH_API_URL = API_URL;

/**
 * 创建独立的 Client 实例（用于测试或多租户场景）
 */
export function createClient(options?: { apiUrl?: string; apiKey?: string }): Client {
    return new Client({
        apiUrl: options?.apiUrl ?? API_URL,
        apiKey: options?.apiKey,
    });
}
