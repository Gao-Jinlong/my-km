import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * DTO for updating current user's profile
 * Used by PATCH /users/me endpoint
 */
export class UpdateProfileDto {
    @ApiProperty({
        example: 'newusername',
        description: 'New username',
        required: false,
    })
    @IsOptional()
    @IsString()
    @Length(2, 30, { message: '用户名长度必须在 2-30 位之间' })
    @Matches(/^[a-zA-Z0-9_-]+$/, {
        message: '用户名只能包含字母、数字、下划线和连字符',
    })
    username?: string;

    @ApiProperty({
        example: 'https://example.com/new-avatar.jpg',
        description: 'Avatar URL',
        required: false,
    })
    @IsOptional()
    @IsString()
    avatar?: string;

    @ApiProperty({
        example: 'Updated bio information',
        description: 'User bio',
        required: false,
    })
    @IsOptional()
    @IsString()
    @Length(0, 500, { message: '个人简介不能超过 500 字符' })
    bio?: string;
}
