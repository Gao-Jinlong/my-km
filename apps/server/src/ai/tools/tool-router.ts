/**
 * ToolRouter — routes LLM tool calls by execution target and danger level.
 *
 * Decision matrix:
 * - backend + low  → auto_execute (run on server, inject result to LLM)
 * - backend + high → frontend_confirm (emit tool_call to client, wait for confirmation)
 * - frontend       → frontend_direct (emit tool_call to client, execute immediately)
 */

import { Injectable } from '@nestjs/common';
import { Emitter, type Event } from '../../base/common/event';
import type { RegisteredTool } from './tool.types';

export type ToolRouteMode = 'auto_execute' | 'frontend_confirm' | 'frontend_direct' | 'error';

export interface ToolRouteDecision {
    mode: ToolRouteMode;
    toolName: string;
    input: unknown;
    conversationId: string;
    toolCallId: string;
    requiresConfirmation: boolean;
    error?: string;
}

@Injectable()
export class ToolRouter {
    private _tools = new Map<string, RegisteredTool>();
    private _onDecision = new Emitter<ToolRouteDecision>();
    private _onAutoExecute = new Emitter<{
        toolName: string;
        input: unknown;
        conversationId: string;
        toolCallId: string;
    }>();

    registerMany(tools: RegisteredTool[]): void {
        for (const tool of tools) {
            this._tools.set(tool.name, tool);
        }
    }

    /**
     * Route a tool call and emit the decision.
     * Returns immediately — actual execution is async via events.
     */
    route(toolName: string, input: unknown, conversationId: string, toolCallId: string): void {
        const tool = this._tools.get(toolName);
        if (!tool) {
            this._onDecision.fire({
                mode: 'error',
                toolName,
                input,
                conversationId,
                toolCallId,
                requiresConfirmation: false,
                error: `Unknown tool: ${toolName}`,
            });
            return;
        }

        const execution = tool.execution ?? 'frontend';
        const danger = tool.danger ?? 'low';

        let mode: ToolRouteMode;
        let requiresConfirmation = false;

        if (execution === 'backend' && danger === 'low') {
            mode = 'auto_execute';
            this._onAutoExecute.fire({ toolName, input, conversationId, toolCallId });
        } else if (execution === 'backend' && danger === 'high') {
            mode = 'frontend_confirm';
            requiresConfirmation = true;
        } else {
            mode = 'frontend_direct';
        }

        this._onDecision.fire({
            mode,
            toolName,
            input,
            conversationId,
            toolCallId,
            requiresConfirmation,
        });
    }

    get onDecision(): Event<ToolRouteDecision> {
        return this._onDecision.event;
    }

    get onAutoExecute(): Event<{
        toolName: string;
        input: unknown;
        conversationId: string;
        toolCallId: string;
    }> {
        return this._onAutoExecute.event;
    }
}
