import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class LlmConfigDto {
    @ApiProperty({ description: 'LLM provider 名称' })
    @IsString()
    @IsNotEmpty()
    provider!: string;

    @ApiPropertyOptional({ description: '模型名称（不传则使用 provider 默认模型）' })
    @IsOptional()
    @IsString()
    model?: string;
}

export class SendMessageDto {
    @ApiPropertyOptional({ description: 'Room ID（可选，不传则自动创建）' })
    @IsOptional()
    @IsString()
    roomId?: string;

    @ApiProperty({ description: '用户消息内容' })
    @IsString()
    @IsNotEmpty()
    content!: string;

    @ApiPropertyOptional({ description: 'AI 上下文信息' })
    @IsOptional()
    @IsObject()
    context?: Record<string, unknown>;

    @ApiPropertyOptional({ description: 'LLM 配置（provider + model）', type: LlmConfigDto })
    @IsOptional()
    @IsObject()
    llmConfig?: LlmConfigDto;
}
