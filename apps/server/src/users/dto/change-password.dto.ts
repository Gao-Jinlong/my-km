import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class ChangePasswordDto {
    @ApiProperty({
        example: 'OldPass123!',
        description: 'Current password',
    })
    @IsNotEmpty({ message: '当前密码不能为空' })
    @IsString()
    oldPassword: string;

    @ApiProperty({
        example: 'NewSecurePass456!',
        description: 'New password (at least 8 chars, uppercase, lowercase, number, special char)',
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
