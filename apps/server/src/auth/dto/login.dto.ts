import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * 用户登录 DTO
 */
export class LoginDto {
    @ApiProperty({
        example: 'user@example.com',
        description: '用户邮箱',
    })
    @IsEmail({}, { message: '请输入有效的邮箱地址' })
    @IsNotEmpty({ message: '邮箱不能为空' })
    email: string;

    @ApiProperty({
        example: 'SecurePass123!',
        description: '用户密码',
    })
    @IsNotEmpty({ message: '密码不能为空' })
    password: string;

    @ApiProperty({
        example: false,
        description: '是否记住我（延长 Refresh Token 有效期至 30 天）',
        required: false,
        default: false,
    })
    @IsOptional()
    @IsBoolean({ message: '记住我必须是布尔值' })
    rememberMe?: boolean;
}
