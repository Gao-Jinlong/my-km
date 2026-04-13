'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { container } from '@/platform/bootstrap';
import type { MonitorService } from '@/platform/monitor/service';
import type { LogEntry } from '@/platform/monitor/types';
import { LogLevel, LogLevelToString } from '@/platform/monitor/types';

const LEVEL_COLORS: Record<number, string> = {
    [LogLevel.DEBUG]: '#6B7280',
    [LogLevel.INFO]: '#2563EB',
    [LogLevel.WARN]: '#D97706',
    [LogLevel.ERROR]: '#DC2626',
};

const LEVEL_BG: Record<number, string> = {
    [LogLevel.DEBUG]: '#F3F4F6',
    [LogLevel.INFO]: '#EFF6FF',
    [LogLevel.WARN]: '#FFFBEB',
    [LogLevel.ERROR]: '#FEF2F2',
};

export function LogPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [levelFilter, setLevelFilter] = useState<LogLevel | -1>(-1);
    const [categoryFilter, setCategoryFilter] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isPaused, setIsPaused] = useState(false);
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const loggerService = useMemo(() => container.get('MonitorService') as MonitorService, []);

    // 加载日志
    const refreshLogs = useCallback(() => {
        if (isPaused) return;
        const history = loggerService.getHistory();
        setLogs(history);
    }, [loggerService, isPaused]);

    // 订阅日志变化
    useEffect(() => {
        const disposable = loggerService.onLogChange(() => {
            refreshLogs();
        });
        refreshLogs();
        return () => disposable.dispose();
    }, [loggerService, refreshLogs]);

    // 自动滚动到底部
    useEffect(() => {
        if (isOpen && scrollRef.current && !isPaused) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [isOpen, isPaused]);

    // 快捷键 Ctrl+Shift+L
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'L') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // 获取所有分类
    const categories = useMemo(() => {
        const cats = new Set<string>();
        for (const log of logs) {
            cats.add(log.category);
        }
        return Array.from(cats).sort();
    }, [logs]);

    // 过滤日志
    const filteredLogs = useMemo(() => {
        return logs.filter(entry => {
            if (levelFilter >= 0 && entry.level !== levelFilter) return false;
            if (categoryFilter && entry.category !== categoryFilter) return false;
            if (searchQuery && !entry.message.toLowerCase().includes(searchQuery.toLowerCase()))
                return false;
            return true;
        });
    }, [logs, levelFilter, categoryFilter, searchQuery]);

    // 清空日志
    const handleClear = useCallback(() => {
        loggerService.clearHistory();
        setLogs([]);
    }, [loggerService]);

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                height: '320px',
                backgroundColor: '#fff',
                borderTop: '2px solid #E5E7EB',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'monospace',
                fontSize: '12px',
            }}
        >
            {/* 工具栏 */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 12px',
                    borderBottom: '1px solid #E5E7EB',
                    backgroundColor: '#F9FAFB',
                    flexShrink: 0,
                }}
            >
                <span style={{ fontWeight: 600, fontSize: '13px' }}>Log Panel</span>

                <select
                    value={levelFilter}
                    onChange={e => setLevelFilter(Number(e.target.value) as LogLevel | -1)}
                    style={{ fontSize: '12px', padding: '2px 4px' }}
                >
                    <option value={-1}>All Levels</option>
                    <option value={LogLevel.DEBUG}>DEBUG</option>
                    <option value={LogLevel.INFO}>INFO</option>
                    <option value={LogLevel.WARN}>WARN</option>
                    <option value={LogLevel.ERROR}>ERROR</option>
                </select>

                <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    style={{ fontSize: '12px', padding: '2px 4px' }}
                >
                    <option value="">All Categories</option>
                    {categories.map(cat => (
                        <option key={cat} value={cat}>
                            {cat}
                        </option>
                    ))}
                </select>

                <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ fontSize: '12px', padding: '2px 6px', width: '140px' }}
                />

                <button
                    type="button"
                    onClick={() => setIsPaused(p => !p)}
                    style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        backgroundColor: isPaused ? '#FEE2E2' : '#F3F4F6',
                        border: '1px solid #D1D5DB',
                        borderRadius: '3px',
                        cursor: 'pointer',
                    }}
                >
                    {isPaused ? 'Resume' : 'Pause'}
                </button>

                <button
                    type="button"
                    onClick={handleClear}
                    style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        backgroundColor: '#F3F4F6',
                        border: '1px solid #D1D5DB',
                        borderRadius: '3px',
                        cursor: 'pointer',
                    }}
                >
                    Clear
                </button>

                <span style={{ marginLeft: 'auto', color: '#6B7280' }}>
                    {filteredLogs.length} / {logs.length}
                </span>

                <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    style={{
                        fontSize: '14px',
                        padding: '0 6px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: '#6B7280',
                    }}
                >
                    x
                </button>
            </div>

            {/* 日志列表 */}
            <div
                ref={scrollRef}
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                }}
            >
                {filteredLogs.map((entry, index) => {
                    const time = new Date(entry.timestamp).toISOString().slice(11, 23);
                    const levelStr = LogLevelToString(entry.level);
                    const isExpanded = expandedIndex === index;

                    return (
                        <div key={`${entry.timestamp}-${index}`}>
                            <button
                                type="button"
                                tabIndex={0}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setExpandedIndex(isExpanded ? null : index);
                                    }
                                }}
                                onClick={() => setExpandedIndex(isExpanded ? null : index)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    padding: '3px 12px',
                                    borderBottom: '1px solid #F3F4F6',
                                    backgroundColor: LEVEL_BG[entry.level] || '#fff',
                                    cursor:
                                        entry.data && entry.data.length > 0 ? 'pointer' : 'default',
                                }}
                            >
                                <span style={{ color: '#9CA3AF', width: '90px', flexShrink: 0 }}>
                                    {time}
                                </span>
                                <span
                                    style={{
                                        color: LEVEL_COLORS[entry.level],
                                        fontWeight: 600,
                                        width: '50px',
                                        flexShrink: 0,
                                    }}
                                >
                                    {levelStr}
                                </span>
                                <span style={{ color: '#6366F1', width: '100px', flexShrink: 0 }}>
                                    [{entry.category}]
                                </span>
                                <span style={{ color: '#1F2937', wordBreak: 'break-all' }}>
                                    {entry.message}
                                </span>
                            </button>
                            {isExpanded && entry.data && entry.data.length > 0 && (
                                <div
                                    style={{
                                        padding: '6px 12px 6px 170px',
                                        backgroundColor: '#F9FAFB',
                                        borderBottom: '1px solid #E5E7EB',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-all',
                                        color: '#4B5563',
                                    }}
                                >
                                    {entry.data.map((d, i) => (
                                        <div key={`${entry.timestamp}-${index}-${i}`}>
                                            {typeof d === 'object'
                                                ? JSON.stringify(d, null, 2)
                                                : String(d)}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
