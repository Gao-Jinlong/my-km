'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listTraces } from '@/api/tracing';

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

export default function TracesPage() {
    const [data, setData] = useState<TracesResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);

    useEffect(() => {
        setLoading(true);
        setError(null);
        listTraces({ page, pageSize: 20 })
            .then(setData)
            .catch(err => {
                setError(err instanceof Error ? err.message : String(err));
                setData(null);
            })
            .finally(() => setLoading(false));
    }, [page]);

    return (
        <div className="container mx-auto p-6">
            <h1 className="mb-6 font-bold text-2xl">LLM Traces</h1>

            {loading && <p className="text-muted-foreground">Loading...</p>}

            {!loading && error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
                    Failed to load traces: {error}
                </div>
            )}

            {!loading && !error && data && (
                <>
                    <p className="mb-4 text-muted-foreground text-sm">Total: {data.total} traces</p>

                    <div className="overflow-hidden rounded-lg border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted">
                                <tr>
                                    <th className="p-3 text-left">Time</th>
                                    <th className="p-3 text-left">Duration</th>
                                    <th className="p-3 text-left">Status</th>
                                    <th className="p-3 text-left">Spans</th>
                                    <th className="p-3 text-left">Thread</th>
                                    <th className="p-3 text-left">Model</th>
                                    <th className="p-3 text-left">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.traces.map(trace => (
                                    <tr key={trace.traceId} className="border-t hover:bg-muted/50">
                                        <td className="p-3">
                                            {new Date(trace.startTime).toLocaleTimeString()}
                                        </td>
                                        <td className="p-3 font-mono">
                                            {trace.durationMs != null
                                                ? `${trace.durationMs}ms`
                                                : '-'}
                                        </td>
                                        <td className="p-3">
                                            <span
                                                className={`rounded px-2 py-0.5 text-xs ${
                                                    trace.status === 'ERROR'
                                                        ? 'bg-red-100 text-red-800'
                                                        : trace.status === 'OK'
                                                          ? 'bg-green-100 text-green-800'
                                                          : 'bg-gray-100 text-gray-800'
                                                }`}
                                            >
                                                {trace.status}
                                            </span>
                                        </td>
                                        <td className="p-3">{trace._count.spans}</td>
                                        <td className="max-w-32 truncate p-3 font-mono text-xs">
                                            {((trace.attributes as Record<string, unknown>)
                                                ?.threadId as string) ?? '-'}
                                        </td>
                                        <td className="p-3 text-xs">
                                            {((trace.attributes as Record<string, unknown>)?.[
                                                'llm.model'
                                            ] as string) ?? '-'}
                                        </td>
                                        <td className="p-3">
                                            <Link
                                                href={`/debug/traces/${trace.traceId}`}
                                                className="hover:underline"
                                            >
                                                View
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-4 flex gap-2">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage(page - 1)}
                            className="rounded border px-3 py-1 disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <span className="px-3 py-1">Page {page}</span>
                        <button
                            type="button"
                            disabled={page * 20 >= data.total}
                            onClick={() => setPage(page + 1)}
                            className="rounded border px-3 py-1 disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
