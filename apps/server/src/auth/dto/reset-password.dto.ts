import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

/**
 * 重置密码 DTO
 */
export class ResetPasswordDto {
    @ApiProperty({
        example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        description: '密码重置 Token（从邮件中获取）',
    })
    @IsNotEmpty({ message: 'Token 不能为空' })
    @IsString()
    token: string;

    @ApiProperty({
        example: 'NewSecurePass123!',
        description: '新密码（至少 8 位，包含大小写字母、数字和特殊字符）',
        minLength: 8,
    })
    @IsNotEmpty({ message: '新密码不能为空' })
    @IsString()
    @Length(8, 128, { message: '密码长度必须在 8-128 位之间' })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
        message: '密码必须包含大小写字母、数字和特殊字符 (@$!%*?&)',
    })
    newPassword: string;
}
