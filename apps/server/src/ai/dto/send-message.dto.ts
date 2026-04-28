import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class SendMessageDto {
    @ApiProperty({ description: '对话 ID' })
    @IsString()
    @IsNotEmpty()
    conversationId!: string;

    @ApiProperty({ description: '用户消息内容' })
    @IsString()
    @IsNotEmpty()
    content!: string;

    @ApiPropertyOptional({ description: 'AI 上下文信息' })
    @IsOptional()
    @IsObject()
    context?: Record<string, unknown>;
}
