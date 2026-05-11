/**
 * AI REST Controller
 *
 * - POST /ai/chat — 发送 AI 消息（同步，遗留）
 * - GET  /ai/conversations — 获取对话列表
 * - POST /ai/conversations — 创建新对话
 * - GET  /ai/conversations/:id/messages — 获取对话消息历史
 * - PATCH /ai/conversations/:id — 更新对话元数据（标题）
 * - DELETE /ai/conversations/:id — 软删除对话
 */

import { Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { ConversationService } from './conversation/conversation.service';
import { SendMessageDto } from './dto/send-message.dto';
import { MessageService } from './message/message.service';

interface CreateConversationBody {
    id?: string;
    title?: string;
}

interface UpdateConversationBody {
    title?: string;
}

interface ListConversationsQuery {
    limit?: string;
    offset?: string;
    status?: string;
}

@ApiTags('AI')
@Controller('ai')
export class AiController {
    private readonly logger = new Logger(AiController.name);

    constructor(
        private aiService: AiService,
        private conversationService: ConversationService,
        private messageService: MessageService,
    ) {}

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

    @Get('conversations')
    @ApiOperation({ summary: '获取对话列表' })
    @ApiResponse({ status: 200, description: '返回对话列表' })
    async listConversations(@Query() query: ListConversationsQuery) {
        const limit = query.limit ? parseInt(query.limit, 10) : 50;
        const offset = query.offset ? parseInt(query.offset, 10) : 0;
        const status = query.status || 'active';

        const conversations = await this.conversationService.findAll({
            limit,
            offset,
            status: status as 'active' | 'archived' | 'deleted',
        });

        return { conversations, limit, offset };
    }

    @Post('conversations')
    @ApiOperation({ summary: '创建新对话' })
    @ApiResponse({ status: 201, description: '对话已创建' })
    async createConversation(@Body() body: CreateConversationBody) {
        const conversation = await this.conversationService.create({
            id: body.id,
            title: body.title,
        });

        return { conversation };
    }

    @Get('conversations/:id/messages')
    @ApiOperation({ summary: '获取对话消息历史' })
    @ApiResponse({ status: 200, description: '返回消息列表' })
    async getMessages(
        @Param('id') id: string,
        @Query('limit') limitStr?: string,
        @Query('offset') offsetStr?: string,
    ) {
        const limit = limitStr ? parseInt(limitStr, 10) : 100;
        const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

        const messages = await this.messageService.findByConversationId(id, {
            limit,
            offset,
        });

        return { messages, limit, offset };
    }

    @Patch('conversations/:id')
    @ApiOperation({ summary: '更新对话元数据' })
    @ApiResponse({ status: 200, description: '对话已更新' })
    async updateConversation(@Param('id') id: string, @Body() body: UpdateConversationBody) {
        const conversation = await this.conversationService.updateMetadata(id, {
            title: body.title,
        });

        return { conversation };
    }

    @Delete('conversations/:id')
    @ApiOperation({ summary: '软删除对话' })
    @ApiResponse({ status: 200, description: '对话已删除' })
    async deleteConversation(@Param('id') id: string) {
        await this.conversationService.delete(id);
        return { success: true };
    }
}
