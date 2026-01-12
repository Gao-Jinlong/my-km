import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryUsersDto {
    @ApiProperty({
        example: '1',
        description: 'Page number',
        required: false,
        default: 1,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: '页码必须是整数' })
    @Min(1, { message: '页码最小为 1' })
    page?: number = 1;

    @ApiProperty({
        example: '10',
        description: 'Items per page',
        required: false,
        default: 10,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: '每页数量必须是整数' })
    @Min(1, { message: '每页数量最小为 1' })
    limit?: number = 10;

    @ApiProperty({
        example: 'john',
        description: 'Search by username',
        required: false,
    })
    @IsOptional()
    @IsString()
    username?: string;

    @ApiProperty({
        example: 'user@example.com',
        description: 'Search by email',
        required: false,
    })
    @IsOptional()
    @IsString()
    email?: string;

    @ApiProperty({
        example: 'true',
        description: 'Filter by active status',
        required: false,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean({ message: '激活状态必须是布尔值' })
    isActive?: boolean;

    @ApiProperty({
        example: 'true',
        description: 'Filter by email verification status',
        required: false,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean({ message: '邮箱验证状态必须是布尔值' })
    isEmailVerified?: boolean;

    @ApiProperty({
        example: 'createdAt,desc',
        description: 'Sort by field and order (field:asc|desc)',
        required: false,
        default: 'createdAt,desc',
    })
    @IsOptional()
    @IsString()
    sortBy?: string = 'createdAt,desc';
}
