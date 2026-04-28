/**
 * AI REST Controller — 用于验证 LLM 调用和 tool call 循环
 *
 * 在 WebSocket 接入之前，先用 REST endpoint 验证核心功能。
 */

import { Body, Controller, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('AI')
@Controller('ai')
export class AiController {
    private readonly logger = new Logger(AiController.name);

    constructor(private aiService: AiService) {}

    @Post('chat')
    @ApiOperation({ summary: '发送 AI 消息（同步）' })
    @ApiResponse({ status: 200, description: '消息处理完成' })
    async sendMessage(@Body() dto: SendMessageDto) {
        this.logger.log(`Received AI chat request: ${dto.content.slice(0, 50)}...`);

        try {
            await this.aiService.handleUserMessage(dto.conversationId, dto.content, dto.context);
            return { success: true };
        } catch (error) {
            this.logger.error('AI chat failed:', error);
            throw error;
        }
    }
}
