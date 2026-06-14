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

type RequestHook = (url: URL, init: RequestInit) => Promise<RequestInit> | RequestInit;

/**
 * Traceparent 注入中间件。
 * 从 getter 获取当前 traceparent，注入到请求 header。
 */
export function withTraceparent(getTraceparent: () => string | null): RequestHook {
    return (_url, init) => {
        const tp = getTraceparent();
        if (!tp) return init;
        const headers = new Headers(init.headers);
        headers.set('traceparent', tp);
        return { ...init, headers };
    };
}

/**
 * 创建 LangGraph Client 实例。
 * @param options.onRequest 可选的请求拦截 hook（用于注入 traceparent 等）
 */
export function createLangGraphClient(options?: { onRequest?: RequestHook }): Client {
    return new Client({
        apiUrl: API_URL,
        ...(options?.onRequest ? { onRequest: options.onRequest } : {}),
    });
}

/**
 * 全局裸单例 Client（供 thread CRUD 等无需 traceparent 的操作）。
 */
export const langgraphClient = createLangGraphClient();

/**
 * 当前 LangGraph API URL
 */
export const LANGGRAPH_API_URL = API_URL;
