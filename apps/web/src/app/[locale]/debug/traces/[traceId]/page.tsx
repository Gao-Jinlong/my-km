'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface SpanItem {
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
    statusMessage: string | null;
    attributes: Record<string, unknown>;
    events: Array<{ name: string; time: string; attributes?: Record<string, unknown> }>;
}

interface TraceDetail {
    id: string;
    traceId: string;
    rootSpanId: string;
    serviceName: string;
    startTime: string;
    endTime: string | null;
    durationMs: number | null;
    status: string;
    attributes: Record<string, unknown>;
    spans: SpanItem[];
}

function WaterfallRow({
    span,
    traceStart,
    traceDuration,
    depth,
}: {
    span: SpanItem;
    traceStart: number;
    traceDuration: number;
    depth: number;
}) {
    const start = new Date(span.startTime).getTime() - traceStart;
    const duration = span.durationMs ?? 0;
    const leftPct = traceDuration > 0 ? (start / traceDuration) * 100 : 0;
    const widthPct = traceDuration > 0 ? Math.max((duration / traceDuration) * 100, 0.5) : 0;

    const [expanded, setExpanded] = useState(false);

    const statusColor =
        span.status === 'ERROR'
            ? 'bg-red-500'
            : span.status === 'OK'
              ? 'bg-green-500'
              : 'bg-gray-400';

    return (
        <div>
            <button
                type="button"
                className="flex h-8 w-full cursor-pointer items-center border-b hover:bg-muted/50"
                style={{ paddingLeft: `${depth * 16}px` }}
                onClick={() => setExpanded(!expanded)}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') setExpanded(!expanded);
                }}
            >
                <div className="w-40 shrink-0 truncate px-2 font-mono text-xs">{span.name}</div>
                <div className="relative mx-2 h-4 flex-1">
                    <div
                        className={`absolute top-0 h-full rounded opacity-70 ${statusColor}`}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    />
                </div>
                <div className="w-20 shrink-0 px-2 text-right font-mono text-xs">
                    {span.durationMs != null ? `${span.durationMs}ms` : '-'}
                </div>
                <div className="w-24 shrink-0 px-2 text-right text-xs">
                    {span.serviceName === 'my-km-web' ? 'frontend' : 'backend'}
                </div>
            </button>

            {expanded && (
                <div
                    className="border-b bg-muted/20 p-4 text-xs"
                    style={{ paddingLeft: `${depth * 16 + 16}px` }}
                >
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                        <div>
                            <span className="text-muted-foreground">Span ID:</span>{' '}
                            <span className="font-mono">{span.spanId}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Status:</span>{' '}
                            <span className={span.status === 'ERROR' ? 'text-red-600' : ''}>
                                {span.status}
                            </span>
                            {span.statusMessage && (
                                <span className="ml-1 text-red-600">({span.statusMessage})</span>
                            )}
                        </div>
                    </div>

                    {Object.keys(span.attributes).length > 0 && (
                        <div className="mt-2">
                            <div className="mb-1 text-muted-foreground">Attributes:</div>
                            <pre className="overflow-x-auto rounded bg-background p-2 text-xs">
                                {JSON.stringify(span.attributes, null, 2)}
                            </pre>
                        </div>
                    )}

                    {span.events.length > 0 && (
                        <div className="mt-2">
                            <div className="mb-1 text-muted-foreground">Events:</div>
                            <div className="space-y-1">
                                {span.events.map((event, i) => (
                                    <div key={`${event.name}-${i}`} className="flex gap-4">
                                        <span className="font-mono">
                                            {new Date(event.time).toLocaleTimeString()}
                                        </span>
                                        <span>{event.name}</span>
                                        {event.attributes && (
                                            <span className="text-muted-foreground">
                                                {JSON.stringify(event.attributes)}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function TraceDetailPage() {
    const { traceId } = useParams<{ traceId: string }>();
    const [trace, setTrace] = useState<TraceDetail | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`http://localhost:3000/api/traces/${traceId}`)
            .then(r => r.json())
            .then(d => setTrace(d))
            .catch(() => setTrace(null))
            .finally(() => setLoading(false));
    }, [traceId]);

    if (loading) return <div className="p-6">Loading...</div>;
    if (!trace) return <div className="p-6">Trace not found</div>;

    const traceStart = new Date(trace.startTime).getTime();
    const traceDuration = trace.durationMs ?? 0;

    // Build span tree for indentation
    const spanMap = new Map(trace.spans.map(s => [s.spanId, s]));
    const depthMap = new Map<string, number>();

    function getDepth(spanId: string): number {
        const cached = depthMap.get(spanId);
        if (cached !== undefined) return cached;
        const span = spanMap.get(spanId);
        if (!span?.parentSpanId) {
            depthMap.set(spanId, 0);
            return 0;
        }
        const depth = getDepth(span.parentSpanId) + 1;
        depthMap.set(spanId, depth);
        return depth;
    }

    // Sort spans by startTime
    const sortedSpans = [...trace.spans].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    return (
        <div className="container mx-auto p-6">
            <div className="mb-6">
                <a href="/debug/traces" className="text-muted-foreground text-sm hover:underline">
                    &larr; Back to traces
                </a>
                <h1 className="mt-2 font-bold text-2xl">Trace: {trace.traceId.slice(0, 16)}...</h1>
                <div className="mt-2 flex gap-6 text-muted-foreground text-sm">
                    <span>Started: {new Date(trace.startTime).toLocaleString()}</span>
                    <span>Duration: {trace.durationMs ?? '-'}ms</span>
                    <span>Spans: {trace.spans.length}</span>
                    <span>
                        Status:{' '}
                        <span className={trace.status === 'ERROR' ? 'text-red-600' : ''}>
                            {trace.status}
                        </span>
                    </span>
                </div>
            </div>

            <div className="overflow-hidden rounded-lg border">
                <div className="flex h-8 items-center border-b bg-muted font-medium text-xs">
                    <div className="w-40 shrink-0 px-2">Name</div>
                    <div className="flex-1 px-2">Timeline</div>
                    <div className="w-20 shrink-0 px-2 text-right">Duration</div>
                    <div className="w-24 shrink-0 px-2 text-right">Source</div>
                </div>

                {sortedSpans.map(span => (
                    <WaterfallRow
                        key={span.spanId}
                        span={span}
                        traceStart={traceStart}
                        traceDuration={traceDuration}
                        depth={getDepth(span.spanId)}
                    />
                ))}
            </div>
        </div>
    );
}
