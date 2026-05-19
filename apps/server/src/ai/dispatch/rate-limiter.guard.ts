/**
 * AI 请求速率限制
 *
 * 内存态滑动窗口限流，防止单用户/单会话频繁请求。
 *
 * 限流策略:
 * - 每用户每分钟最多 N 条消息
 * - 每会话每分钟最多 M 条消息
 */

import { Injectable, Logger } from '@nestjs/common';

interface RateWindow {
    count: number;
    windowStart: number;
}

interface RateLimitOpts {
    maxRequests?: number; // 窗口内最大请求数，默认 20
    windowMs?: number; // 窗口时长（毫秒），默认 60s
}

@Injectable()
export class AiRateLimiter {
    private readonly logger = new Logger(AiRateLimiter.name);
    private readonly DEFAULT_MAX = 20;
    private readonly DEFAULT_WINDOW = 60_000; // 1 分钟

    private userWindows = new Map<string, RateWindow>();
    private sessionWindows = new Map<string, RateWindow>();

    /**
     * 检查是否超过速率限制
     * @returns true = 允许通过, false = 拒绝
     */
    check(userId: string | null, sessionId: string, opts: RateLimitOpts = {}): boolean {
        const maxRequests = opts.maxRequests ?? this.DEFAULT_MAX;
        const windowMs = opts.windowMs ?? this.DEFAULT_WINDOW;
        const now = Date.now();

        // 按会话检查
        const sessionWindow = this.getWindow(this.sessionWindows, sessionId, now, windowMs);
        if (sessionWindow.count >= maxRequests) {
            this.logger.warn(`Rate limit exceeded for session ${sessionId}`);
            return false;
        }

        // 按用户检查（如果有 userId）
        if (userId) {
            const userWindow = this.getWindow(this.userWindows, userId, now, windowMs);
            if (userWindow.count >= maxRequests * 2) {
                // 用户级别限制更宽松（多会话聚合），是会话限制的 2 倍
                this.logger.warn(`Rate limit exceeded for user ${userId}`);
                return false;
            }
            userWindow.count++;
        }

        sessionWindow.count++;
        return true;
    }

    /**
     * 获取或创建速率窗口
     */
    private getWindow(
        windows: Map<string, RateWindow>,
        key: string,
        now: number,
        windowMs: number,
    ): RateWindow {
        let window = windows.get(key);

        if (!window || now - window.windowStart > windowMs) {
            window = { count: 0, windowStart: now };
            windows.set(key, window);
        }

        return window;
    }

    /**
     * 清理过期窗口（建议定时调用）
     */
    cleanup(maxAgeMs = 300_000): void {
        const now = Date.now();
        const cutoff = now - maxAgeMs;

        for (const [key, window] of this.userWindows) {
            if (window.windowStart < cutoff) {
                this.userWindows.delete(key);
            }
        }
        for (const [key, window] of this.sessionWindows) {
            if (window.windowStart < cutoff) {
                this.sessionWindows.delete(key);
            }
        }
    }
}
