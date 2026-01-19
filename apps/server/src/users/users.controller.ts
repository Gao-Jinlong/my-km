import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, Public } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailService } from '../email/email.service';
import { ChangeOwnPasswordDto } from './dto/change-own-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly emailService: EmailService,
    ) {}

    /**
     * User registration (public endpoint)
     * Moved from Auth module as part of refactoring
     */
    @Public()
    @Post('register')
    @ApiOperation({ summary: 'Register a new user' })
    @ApiResponse({
        status: 201,
        description: 'User registered successfully. Verification email sent.',
    })
    @ApiResponse({ status: 400, description: 'Bad request - validation error' })
    @ApiResponse({ status: 409, description: 'Conflict - email or username already exists' })
    async register(@Body() registerDto: RegisterDto, @Req() req: Request) {
        const { email, password, username } = registerDto;
        const traceId = (req as any).traceId;

        const result = await this.usersService.registerUser(email, password, username, traceId);

        // Send verification email asynchronously
        this.emailService
            .sendVerificationEmail(
                result.user.email,
                result.user.username || result.user.email,
                result.verificationToken,
            )
            .catch(error => {
                console.error('发送验证邮件失败:', error);
            });

        return {
            user: result.user,
            message: '注册成功，请查收验证邮件',
        };
    }

    /**
     * Get current user profile (authenticated endpoint)
     */
    @Get('me')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiResponse({ status: 200, description: 'Return current user profile' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getCurrentUser(@CurrentUser('id') userId: string) {
        return this.usersService.findOne(userId);
    }

    /**
     * Update current user profile (authenticated endpoint)
     */
    @Patch('me')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Update current user profile' })
    @ApiResponse({ status: 200, description: 'Profile updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 409, description: 'Conflict - username already exists' })
    async updateCurrentProfile(
        @CurrentUser('id') userId: string,
        @Body() updateProfileDto: UpdateProfileDto,
        @Req() req: Request,
    ) {
        const traceId = (req as any).traceId;
        return this.usersService.updateProfile(userId, updateProfileDto, traceId);
    }

    /**
     * Change own password (authenticated endpoint)
     */
    @Patch('me/password')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Change own password' })
    @ApiResponse({ status: 200, description: 'Password changed successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 400, description: 'Invalid old password' })
    async changeOwnPassword(
        @CurrentUser('id') userId: string,
        @Body() changeOwnPasswordDto: ChangeOwnPasswordDto,
        @Req() req: Request,
    ) {
        const traceId = (req as any).traceId;
        return this.usersService.changeOwnPassword(
            userId,
            changeOwnPasswordDto.oldPassword,
            changeOwnPasswordDto.newPassword,
            traceId,
        );
    }

    /**
     * Delete own account (authenticated endpoint)
     */
    @Delete('me')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Delete own account' })
    @ApiResponse({ status: 200, description: 'Account deleted successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async deleteOwnAccount(@CurrentUser('id') userId: string, @Req() req: Request) {
        const traceId = (req as any).traceId;
        return this.usersService.deleteAccount(userId, traceId);
    }

    /**
     * Create a new user (admin endpoint)
     * Note: This endpoint is for administrative use. Role-based guards will be added later.
     */
    @Post('admin')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Create a new user (admin only)' })
    @ApiResponse({ status: 201, description: 'User created successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - validation error' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 409, description: 'Conflict - email or username already exists' })
    create(@Body() createUserDto: CreateUserDto, @Req() req: Request) {
        const traceId = (req as any).traceId;
        return this.usersService.create(createUserDto, traceId);
    }

    @Get()
    @ApiOperation({ summary: 'Get all users with pagination (admin only)' })
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
