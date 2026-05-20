/**
 * AI REST Controller
 *
 * - POST /ai/chat — 发送 AI 消息（通过 RequestDispatcher 分发）
 * - GET  /ai/rooms — 获取对话列表
 * - POST /ai/rooms — 创建新对话
 * - GET  /ai/rooms/:id/messages — 获取对话消息历史
 * - PATCH /ai/rooms/:id — 更新对话元数据（标题）
 * - DELETE /ai/rooms/:id — 软删除对话
 */

import { Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RoomService } from './conversation/room.service';
import { RequestDispatcher } from './dispatch/request-dispatcher';
import { SendMessageDto } from './dto/send-message.dto';
import { ProviderRegistry } from './llm/provider-registry';
import { MessageService } from './message/message.service';

interface CreateRoomBody {
    id?: string;
    title?: string;
}

interface UpdateRoomBody {
    title?: string;
}

interface ListRoomsQuery {
    limit?: string;
    offset?: string;
    status?: string;
}

@ApiTags('AI')
@Controller('ai')
export class AiController {
    private readonly logger = new Logger(AiController.name);

    constructor(
        private requestDispatcher: RequestDispatcher,
        private roomService: RoomService,
        private messageService: MessageService,
        private providerRegistry: ProviderRegistry,
    ) {}

    @Post('chat')
    @ApiOperation({ summary: '发送 AI 消息（通过 RequestDispatcher）' })
    @ApiResponse({ status: 200, description: '消息处理完成' })
    async sendMessage(@Body() dto: SendMessageDto) {
        this.logger.log(`Received AI chat request: ${dto.content.slice(0, 50)}...`);

        try {
            let roomId = dto.roomId;
            if (!roomId) {
                const room = await this.roomService.create();
                roomId = room.id;
                this.logger.log(`Auto-created room: ${roomId}`);
            }

            await this.requestDispatcher.dispatch({
                roomId,
                clientId: `rest:${Date.now()}`,
                content: dto.content,
                context: dto.context,
                llmConfigMap: dto.llmConfig
                    ? {
                          llm_call: {
                              provider: dto.llmConfig.provider,
                              model: dto.llmConfig.model || '',
                          },
                      }
                    : undefined,
                defaultConfig: this.providerRegistry.defaultConfig,
            });

            return { success: true, roomId };
        } catch (error) {
            this.logger.error('AI chat failed:', error);
            throw error;
        }
    }

    @Get('rooms')
    @ApiOperation({ summary: '获取对话列表' })
    @ApiResponse({ status: 200, description: '返回对话列表' })
    async listRooms(@Query() query: ListRoomsQuery) {
        const limit = query.limit ? parseInt(query.limit, 10) : 50;
        const offset = query.offset ? parseInt(query.offset, 10) : 0;
        const status = query.status || 'active';

        const rooms = await this.roomService.findAll({
            limit,
            offset,
            status: status as 'active' | 'archived' | 'deleted',
        });

        return { rooms, limit, offset };
    }

    @Post('rooms')
    @ApiOperation({ summary: '创建新对话' })
    @ApiResponse({ status: 201, description: '对话已创建' })
    async createRoom(@Body() body: CreateRoomBody) {
        const room = await this.roomService.create({
            id: body.id,
            title: body.title,
        });

        return { room };
    }

    @Get('rooms/:id/messages')
    @ApiOperation({ summary: '获取对话消息历史' })
    @ApiResponse({ status: 200, description: '返回消息列表' })
    async getMessages(
        @Param('id') id: string,
        @Query('limit') limitStr?: string,
        @Query('offset') offsetStr?: string,
    ) {
        const limit = limitStr ? parseInt(limitStr, 10) : 100;
        const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

        const messages = await this.messageService.findByRoomId(id, {
            limit,
            offset,
        });

        return { messages, limit, offset };
    }

    @Patch('rooms/:id')
    @ApiOperation({ summary: '更新对话元数据' })
    @ApiResponse({ status: 200, description: '对话已更新' })
    async updateRoom(@Param('id') id: string, @Body() body: UpdateRoomBody) {
        const room = await this.roomService.updateMetadata(id, {
            title: body.title,
        });

        return { room };
    }

    @Delete('rooms/:id')
    @ApiOperation({ summary: '软删除对话' })
    @ApiResponse({ status: 200, description: '对话已删除' })
    async deleteRoom(@Param('id') id: string) {
        await this.roomService.delete(id);
        return { success: true };
    }
}
