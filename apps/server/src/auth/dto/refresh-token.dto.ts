import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 刷新 Token DTO
 */
export class RefreshTokenDto {
    @ApiProperty({
        example: 'eyJhbGciOiJIUzI1NiIs...',
        description: 'Refresh Token',
    })
    @IsNotEmpty({ message: 'Refresh Token 不能为空' })
    @IsString()
    refreshToken: string;
}
