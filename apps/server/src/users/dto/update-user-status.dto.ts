import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateUserStatusDto {
    @ApiProperty({
        example: true,
        description: 'Account active status',
        required: false,
    })
    @IsOptional()
    @IsBoolean({ message: '激活状态必须是布尔值' })
    isActive?: boolean;

    @ApiProperty({
        example: true,
        description: 'Email verified status',
        required: false,
    })
    @IsOptional()
    @IsBoolean({ message: '邮箱验证状态必须是布尔值' })
    isEmailVerified?: boolean;
}
