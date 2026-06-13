import { publicApiClient } from './client';

/** NestJS TransformInterceptor 包装的响应格式 */
interface WrappedResponse<T> {
    success: boolean;
    data: T;
    timestamp: string;
    traceId: string;
    duration: number;
}

interface TraceListItem {
    id: string;
    traceId: string;
    rootSpanId: string;
    serviceName: string;
    startTime: string;
    endTime: string | null;
    durationMs: number | null;
    status: string;
    attributes: Record<string, unknown>;
    _count: { spans: number };
}

interface TracesResponse {
    traces: TraceListItem[];
    total: number;
    page: number;
    pageSize: number;
}

export interface SpanDetail {
    id: string;
    spanId: string;
    traceId: string;
    parentSpanId: string | null;
    name: string;
    kind: string;
    serviceName: string;
    startTime: string;
    endTime: string | null;
    durationMs: number | null;
    status: string;
    statusMessage?: string;
    attributes: Record<string, unknown>;
    events: Array<{ name: string; time: string; attributes?: Record<string, unknown> }>;
}

export interface TraceDetail {
    id: string;
    traceId: string;
    rootSpanId: string;
    serviceName: string;
    startTime: string;
    endTime: string | null;
    durationMs: number | null;
    status: string;
    attributes: Record<string, unknown>;
    spans: SpanDetail[];
}

interface QueryTracesParams {
    page?: number;
    pageSize?: number;
    threadId?: string;
    status?: string;
    from?: string;
    to?: string;
}

/**
 * 查询 trace 列表
 */
export async function listTraces(params: QueryTracesParams = {}): Promise<TracesResponse> {
    const res = await publicApiClient
        .get('traces', { searchParams: params as Record<string, string | number> })
        .json<WrappedResponse<TracesResponse>>();
    return res.data;
}

/**
 * 获取单个 trace 详情（含所有 span）
 */
export async function getTrace(traceId: string): Promise<TraceDetail> {
    const res = await publicApiClient.get(`traces/${traceId}`).json<WrappedResponse<TraceDetail>>();
    return res.data;
}

export const tracingApi = {
    listTraces,
    getTrace,
};
