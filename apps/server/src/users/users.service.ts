import { Prisma, User } from '@my-km/prisma';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { PasswordService } from '../auth/services/password.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { LoggerService } from '../logger/logger.service';

// Safe user select for queries (excludes password)
const SAFE_USER_SELECT = {
    id: true,
    email: true,
    username: true,
    avatar: true,
    bio: true,
    isEmailVerified: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    lastLoginAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
    constructor(
        private prisma: PrismaService,
        private passwordService: PasswordService,
        private logger: LoggerService,
    ) {
        this.logger.setContext('UsersService');
    }

    /**
     * Find all users with pagination, filtering, and field selection
     */
    async findAll(query: QueryUsersDto) {
        const { page = 1, limit = 10, username, email, isActive, isEmailVerified, sortBy } = query;

        // Build where clause
        const where: Prisma.UserWhereInput = {};

        if (username) {
            where.username = { contains: username, mode: 'insensitive' };
        }

        if (email) {
            where.email = { contains: email, mode: 'insensitive' };
        }

        if (isActive !== undefined) {
            where.isActive = isActive;
        }

        if (isEmailVerified !== undefined) {
            where.isEmailVerified = isEmailVerified;
        }

        // Parse sort by
        const [sortField, sortOrder] = (sortBy || 'createdAt,desc').split(',');
        const orderBy: Prisma.UserOrderByWithRelationInput = {
            [sortField || 'createdAt']: sortOrder === 'asc' ? 'asc' : 'desc',
        };

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Execute queries in parallel
        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                select: SAFE_USER_SELECT,
                orderBy,
                skip,
                take: limit,
            }),
            this.prisma.user.count({ where }),
        ]);

        this.logger.info('Retrieved users list', {
            count: users.length,
            total,
            page,
            limit,
        });

        return {
            data: users,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Find user by ID
     */
    async findOne(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: SAFE_USER_SELECT,
        });

        if (!user) {
            this.logger.warn('User not found', undefined, { userId: id });
            throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在');
        }

        this.logger.info('Retrieved user by ID', { userId: id });
        return user;
    }

    /**
     * Find user by email (internal use, excludes password)
     */
    async findByEmail(email: string): Promise<Omit<User, 'password'> | null> {
        const user = await this.prisma.user.findUnique({
            where: { email },
            select: SAFE_USER_SELECT,
        });

        return user;
    }

    /**
     * Find user by email with password (for authentication only)
     */
    async findByEmailWithPassword(email: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { email },
        });
    }

    /**
     * Create a new user
     */
    async create(data: CreateUserDto, traceId?: string) {
        const { email, username, password, avatar, bio } = data;

        // Check if email already exists
        const existingUser = await this.prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            this.logger.warn('Email already exists', undefined, { email, traceId });
            throw new BusinessException(ErrorCode.AUTH_EMAIL_ALREADY_EXISTS, '邮箱已被使用');
        }

        // Check if username already exists
        if (username) {
            const existingUsername = await this.prisma.user.findUnique({
                where: { username },
            });

            if (existingUsername) {
                this.logger.warn('Username already exists', undefined, { username, traceId });
                throw new BusinessException(ErrorCode.USER_ALREADY_EXISTS, '用户名已被使用');
            }
        }

        // Hash password if provided
        let hashedPassword: string | undefined;
        if (password) {
            hashedPassword = await this.passwordService.hashPassword(password);
        }

        // Generate username from email if not provided
        const finalUsername = username || email.split('@')[0];

        // Create user
        const user = await this.prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                username: finalUsername,
                avatar,
                bio,
                isEmailVerified: false,
                isActive: true,
            },
            select: SAFE_USER_SELECT,
        });

        this.logger.info('User created successfully', {
            userId: user.id,
            email: user.email,
            traceId,
        });

        return user;
    }

    /**
     * Update user
     */
    async update(id: string, data: UpdateUserDto, traceId?: string) {
        // Check if user exists
        const existingUser = await this.prisma.user.findUnique({
            where: { id },
        });

        if (!existingUser) {
            this.logger.warn('User not found for update', undefined, { userId: id, traceId });
            throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在');
        }

        const { email, username } = data;

        // Check email uniqueness if updating
        if (email && email !== existingUser.email) {
            const emailExists = await this.prisma.user.findUnique({
                where: { email },
            });

            if (emailExists) {
                this.logger.warn('Email already exists', undefined, { email, userId: id, traceId });
                throw new BusinessException(ErrorCode.AUTH_EMAIL_ALREADY_EXISTS, '邮箱已被使用');
            }
        }

        // Check username uniqueness if updating
        if (username && username !== existingUser.username) {
            const usernameExists = await this.prisma.user.findUnique({
                where: { username },
            });

            if (usernameExists) {
                this.logger.warn('Username already exists', undefined, { username, userId: id, traceId });
                throw new BusinessException(ErrorCode.USER_ALREADY_EXISTS, '用户名已被使用');
            }
        }

        // Update user
        const updatedUser = await this.prisma.user.update({
            where: { id },
            data: {
                ...data,
                updatedAt: new Date(),
            },
            select: SAFE_USER_SELECT,
        });

        this.logger.info('User updated successfully', {
            userId: id,
            updatedFields: Object.keys(data),
            traceId,
        });

        return updatedUser;
    }

    /**
     * Soft delete user (set isActive to false)
     */
    async delete(id: string, traceId?: string) {
        // Check if user exists
        const existingUser = await this.prisma.user.findUnique({
            where: { id },
        });

        if (!existingUser) {
            this.logger.warn('User not found for deletion', undefined, { userId: id, traceId });
            throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在');
        }

        // Soft delete
        await this.prisma.user.update({
            where: { id },
            data: {
                isActive: false,
                updatedAt: new Date(),
            },
        });

        this.logger.info('User soft deleted', {
            userId: id,
            email: existingUser.email,
            traceId,
        });

        return {
            message: '用户已删除',
            userId: id,
        };
    }

    /**
     * Update user status (active/inactive, email verified)
     */
    async updateStatus(id: string, data: UpdateUserStatusDto, traceId?: string) {
        // Check if user exists
        const existingUser = await this.prisma.user.findUnique({
            where: { id },
        });

        if (!existingUser) {
            this.logger.warn('User not found for status update', undefined, { userId: id, traceId });
            throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在');
        }

        const { isActive, isEmailVerified } = data;

        // Update status
        const updatedUser = await this.prisma.user.update({
            where: { id },
            data: {
                ...(isActive !== undefined && { isActive }),
                ...(isEmailVerified !== undefined && { isEmailVerified }),
                updatedAt: new Date(),
            },
            select: SAFE_USER_SELECT,
        });

        this.logger.info('User status updated', {
            userId: id,
            statusChanges: data,
            traceId,
        });

        return updatedUser;
    }

    /**
     * Update last login timestamp
     */
    async updateLastLogin(id: string, traceId?: string): Promise<void> {
        try {
            await this.prisma.user.update({
                where: { id },
                data: { lastLoginAt: new Date() },
            });

            this.logger.debug('Last login updated', { userId: id, traceId });
        } catch (error) {
            this.logger.error('Failed to update last login', error.stack, { userId: id, traceId });
        }
    }

    /**
     * Change password
     */
    async changePassword(id: string, data: ChangePasswordDto, traceId?: string) {
        // Check if user exists
        const existingUser = await this.prisma.user.findUnique({
            where: { id },
        });

        if (!existingUser) {
            this.logger.warn('User not found for password change', undefined, { userId: id, traceId });
            throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在');
        }

        // Verify old password
        if (!existingUser.password) {
            this.logger.warn('User has no password (OAuth user)', undefined, { userId: id, traceId });
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, '该账户使用第三方登录，无法修改密码');
        }

        const isOldPasswordValid = await this.passwordService.comparePassword(
            data.oldPassword,
            existingUser.password,
        );

        if (!isOldPasswordValid) {
            this.logger.warn('Invalid old password', undefined, { userId: id, traceId });
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS, '当前密码错误');
        }

        // Check if new password is same as old
        const isSamePassword = await this.passwordService.comparePassword(
            data.newPassword,
            existingUser.password,
        );

        if (isSamePassword) {
            this.logger.warn('New password same as old', undefined, { userId: id, traceId });
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, '新密码不能与当前密码相同');
        }

        // Hash new password
        const hashedPassword = await this.passwordService.hashPassword(data.newPassword);

        // Update password
        await this.prisma.user.update({
            where: { id },
            data: {
                password: hashedPassword,
                updatedAt: new Date(),
            },
        });

        this.logger.info('Password changed successfully', {
            userId: id,
            traceId,
        });

        return {
            message: '密码修改成功',
            userId: id,
        };
    }
}
