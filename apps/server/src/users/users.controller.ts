import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UsersService } from './users.service';
import type { Request } from 'express';

@ApiTags('users')
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Post()
    @ApiOperation({ summary: 'Create a new user' })
    @ApiResponse({ status: 201, description: 'User created successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - validation error' })
    @ApiResponse({ status: 409, description: 'Conflict - email or username already exists' })
    create(@Body() createUserDto: CreateUserDto, @Req() req: Request) {
        const traceId = (req as any).traceId;
        return this.usersService.create(createUserDto, traceId);
    }

    @Get()
    @ApiOperation({ summary: 'Get all users with pagination' })
    @ApiResponse({ status: 200, description: 'Return paginated users' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'username', required: false, type: String })
    @ApiQuery({ name: 'email', required: false, type: String })
    @ApiQuery({ name: 'isActive', required: false, type: Boolean })
    @ApiQuery({ name: 'isEmailVerified', required: false, type: Boolean })
    findAll(@Query() query: QueryUsersDto) {
        return this.usersService.findAll(query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a user by ID' })
    @ApiParam({ name: 'id', description: 'User ID' })
    @ApiResponse({ status: 200, description: 'Return user by ID' })
    @ApiResponse({ status: 404, description: 'User not found' })
    findOne(@Param('id') id: string) {
        return this.usersService.findOne(id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update a user' })
    @ApiParam({ name: 'id', description: 'User ID' })
    @ApiResponse({ status: 200, description: 'User updated successfully' })
    @ApiResponse({ status: 404, description: 'User not found' })
    @ApiResponse({ status: 409, description: 'Conflict - email or username already exists' })
    update(@Param('id') id: string, @Body() data: UpdateUserDto, @Req() req: Request) {
        const traceId = (req as any).traceId;
        return this.usersService.update(id, data, traceId);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Soft delete a user (set isActive to false)' })
    @ApiParam({ name: 'id', description: 'User ID' })
    @ApiResponse({ status: 200, description: 'User deleted successfully' })
    @ApiResponse({ status: 404, description: 'User not found' })
    remove(@Param('id') id: string, @Req() req: Request) {
        const traceId = (req as any).traceId;
        return this.usersService.delete(id, traceId);
    }

    @Patch(':id/status')
    @ApiOperation({ summary: 'Update user status (active/inactive, email verified)' })
    @ApiParam({ name: 'id', description: 'User ID' })
    @ApiResponse({ status: 200, description: 'User status updated successfully' })
    @ApiResponse({ status: 404, description: 'User not found' })
    updateStatus(@Param('id') id: string, @Body() data: UpdateUserStatusDto, @Req() req: Request) {
        const traceId = (req as any).traceId;
        return this.usersService.updateStatus(id, data, traceId);
    }

    @Post(':id/change-password')
    @ApiOperation({ summary: 'Change user password' })
    @ApiParam({ name: 'id', description: 'User ID' })
    @ApiResponse({ status: 200, description: 'Password changed successfully' })
    @ApiResponse({ status: 400, description: 'Invalid old password' })
    @ApiResponse({ status: 404, description: 'User not found' })
    changePassword(@Param('id') id: string, @Body() data: ChangePasswordDto, @Req() req: Request) {
        const traceId = (req as any).traceId;
        return this.usersService.changePassword(id, data, traceId);
    }

    @Post(':id/last-login')
    @ApiOperation({ summary: 'Update last login timestamp (internal use)' })
    @ApiParam({ name: 'id', description: 'User ID' })
    @ApiResponse({ status: 200, description: 'Last login updated' })
    updateLastLogin(@Param('id') id: string, @Req() req: Request) {
        const traceId = (req as any).traceId;
        return this.usersService.updateLastLogin(id, traceId);
    }
}
