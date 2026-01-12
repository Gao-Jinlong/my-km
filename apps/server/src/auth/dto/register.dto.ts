import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * 用户注册 DTO
 */
export class RegisterDto {
    @ApiProperty({
        example: 'user@example.com',
        description: '用户邮箱',
    })
    @IsEmail({}, { message: '请输入有效的邮箱地址' })
    @IsNotEmpty({ message: '邮箱不能为空' })
    email: string;

    @ApiProperty({
        example: 'SecurePass123!',
        description: '用户密码（至少 8 位，包含大小写字母、数字和特殊字符）',
        minLength: 8,
    })
    @IsNotEmpty({ message: '密码不能为空' })
    @IsString()
    @Length(8, 128, { message: '密码长度必须在 8-128 位之间' })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
        message: '密码必须包含大小写字母、数字和特殊字符 (@$!%*?&)',
    })
    password: string;

    @ApiProperty({
        example: 'johndoe',
        description: '用户名（可选，未填写时使用邮箱前缀）',
        required: false,
    })
    @IsOptional()
    @IsString()
    @Length(2, 30, { message: '用户名长度必须在 2-30 位之间' })
    @Matches(/^[a-zA-Z0-9_-]+$/, {
        message: '用户名只能包含字母、数字、下划线和连字符',
    })
    username?: string;
}
