import { randomBytes } from 'node:crypto';
import { Prisma, User } from '@my-km/prisma';
import { Injectable } from '@nestjs/common';
import { PasswordService } from '../auth/services/password.service';
import { CacheTTL } from '../cache/cache.constants';
import { CacheService } from '../cache/cache.service';
import { ErrorCode } from '../common/constants/error-codes';
import { BusinessException } from '../common/exceptions/business.exception';
import { LoggerService } from '../logger/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

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
        private cache: CacheService,
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
        // 1. Try to get from cache
        const cacheKey = this.cache.getUserKey(id);
        const cachedUser = await this.cache.get<Omit<User, 'password'>>(cacheKey);

        if (cachedUser) {
            this.logger.debug('User found in cache', { userId: id });
            return cachedUser;
        }

        // 2. Cache miss, query database
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: SAFE_USER_SELECT,
        });

        if (!user) {
            this.logger.warn('User not found', undefined, { userId: id });
            throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在');
        }

        // 3. Write to cache
        await this.cache.set(cacheKey, user, CacheTTL.USER);
        this.logger.info('User cached', { userId: id });

        return user;
    }

    /**
     * Find user by email (internal use, excludes password)
     */
    async findByEmail(email: string): Promise<Omit<User, 'password'> | null> {
        // 1. Try to get from cache
        const cacheKey = this.cache.getUserByEmailKey(email);
        const cachedUser = await this.cache.get<Omit<User, 'password'>>(cacheKey);

        if (cachedUser) {
            this.logger.debug('User found in cache by email', { email });
            return cachedUser;
        }

        // 2. Cache miss, query database
        const user = await this.prisma.user.findUnique({
            where: { email },
            select: SAFE_USER_SELECT,
        });

        if (!user) {
            return null;
        }

        // 3. Write to cache
        await this.cache.set(cacheKey, user, CacheTTL.USER_EMAIL);
        this.logger.info('User cached by email', { email });

        return user;
    }

    /**
     * Find user by email with password (for authentication only)
     * Note: Authentication queries should not cache password hashes
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

        // Write to cache (new user)
        await this.cache.set(this.cache.getUserKey(user.id), user, CacheTTL.USER);
        await this.cache.set(this.cache.getUserByEmailKey(user.email), user, CacheTTL.USER_EMAIL);

        this.logger.info('User created and cached', {
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
                this.logger.warn('Username already exists', undefined, {
                    username,
                    userId: id,
                    traceId,
                });
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

        // Refresh cache
        await this.cache.set(this.cache.getUserKey(id), updatedUser, CacheTTL.USER);

        // If email was updated, delete old email cache
        if (email && email !== existingUser.email) {
            await this.cache.del(this.cache.getUserByEmailKey(existingUser.email));
        }

        this.logger.info('User updated and cache refreshed', {
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

        // Clear cache
        await this.cache.del(this.cache.getUserKey(id));
        await this.cache.del(this.cache.getUserByEmailKey(existingUser.email));

        this.logger.info('User deleted and cache cleared', {
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
            this.logger.warn('User not found for status update', undefined, {
                userId: id,
                traceId,
            });
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
            this.logger.warn('User not found for password change', undefined, {
                userId: id,
                traceId,
            });
            throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在');
        }

        // Verify old password
        if (!existingUser.password) {
            this.logger.warn('User has no password (OAuth user)', undefined, {
                userId: id,
                traceId,
            });
            throw new BusinessException(
                ErrorCode.VALIDATION_ERROR,
                '该账户使用第三方登录，无法修改密码',
            );
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

        // Clear cache (security consideration)
        await this.cache.del(this.cache.getUserKey(id));

        this.logger.info('Password changed and cache cleared', {
            userId: id,
            traceId,
        });

        return {
            message: '密码修改成功',
            userId: id,
        };
    }

    /**
     * User registration (moved from AuthService)
     * Creates user and email verification token
     */
    async registerUser(email: string, password: string, username?: string, traceId?: string) {
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

        // Hash password
        const hashedPassword = await this.passwordService.hashPassword(password);

        // Generate username from email if not provided
        const finalUsername = username || email.split('@')[0];

        // Create user
        const user = await this.prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                username: finalUsername,
                isEmailVerified: false,
                isActive: true,
            },
            select: SAFE_USER_SELECT,
        });

        // Generate email verification token
        const token = this.generateSecureToken();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiry

        await this.prisma.emailVerification.create({
            data: {
                userId: user.id,
                token,
                expiresAt,
            },
        });

        // Write to cache
        await this.cache.set(this.cache.getUserKey(user.id), user, CacheTTL.USER);
        await this.cache.set(this.cache.getUserByEmailKey(user.email), user, CacheTTL.USER_EMAIL);

        this.logger.info('User registered with verification token', {
            userId: user.id,
            email: user.email,
            traceId,
        });

        // Return user and token (email sending will be handled by caller/EmailService)
        return {
            user,
            verificationToken: token,
        };
    }

    /**
     * Update current user's profile
     */
    async updateProfile(
        userId: string,
        data: Partial<Pick<UpdateUserDto, 'username' | 'avatar' | 'bio'>>,
        traceId?: string,
    ) {
        // Check if user exists
        const existingUser = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!existingUser) {
            this.logger.warn('User not found for profile update', undefined, { userId, traceId });
            throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在');
        }

        // Check username uniqueness if updating
        if (data.username && data.username !== existingUser.username) {
            const usernameExists = await this.prisma.user.findUnique({
                where: { username: data.username },
            });

            if (usernameExists) {
                this.logger.warn('Username already exists', undefined, {
                    username: data.username,
                    userId,
                    traceId,
                });
                throw new BusinessException(ErrorCode.USER_ALREADY_EXISTS, '用户名已被使用');
            }
        }

        // Update user profile
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: {
                ...data,
                updatedAt: new Date(),
            },
            select: SAFE_USER_SELECT,
        });

        // Refresh cache
        await this.cache.set(this.cache.getUserKey(userId), updatedUser, CacheTTL.USER);

        this.logger.info('User profile updated and cache refreshed', {
            userId,
            updatedFields: Object.keys(data),
            traceId,
        });

        return updatedUser;
    }

    /**
     * Change own password (with old password verification)
     */
    async changeOwnPassword(
        userId: string,
        oldPassword: string,
        newPassword: string,
        traceId?: string,
    ) {
        // Check if user exists
        const existingUser = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!existingUser) {
            this.logger.warn('User not found for password change', undefined, { userId, traceId });
            throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在');
        }

        // Verify user has password (not OAuth user)
        if (!existingUser.password) {
            this.logger.warn('User has no password (OAuth user)', undefined, { userId, traceId });
            throw new BusinessException(
                ErrorCode.VALIDATION_ERROR,
                '该账户使用第三方登录，无法修改密码',
            );
        }

        // Verify old password
        const isOldPasswordValid = await this.passwordService.comparePassword(
            oldPassword,
            existingUser.password,
        );

        if (!isOldPasswordValid) {
            this.logger.warn('Invalid old password', undefined, { userId, traceId });
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS, '当前密码错误');
        }

        // Check if new password is same as old
        const isSamePassword = await this.passwordService.comparePassword(
            newPassword,
            existingUser.password,
        );

        if (isSamePassword) {
            this.logger.warn('New password same as old', undefined, { userId, traceId });
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, '新密码不能与当前密码相同');
        }

        // Hash new password
        const hashedPassword = await this.passwordService.hashPassword(newPassword);

        // Update password
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword,
                updatedAt: new Date(),
            },
        });

        // Clear cache (security consideration)
        await this.cache.del(this.cache.getUserKey(userId));

        this.logger.info('Own password changed and cache cleared', {
            userId,
            traceId,
        });

        return {
            message: '密码修改成功',
            userId,
        };
    }

    /**
     * Delete own account
     */
    async deleteAccount(userId: string, traceId?: string) {
        // Check if user exists
        const existingUser = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!existingUser) {
            this.logger.warn('User not found for account deletion', undefined, { userId, traceId });
            throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在');
        }

        // Soft delete
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                isActive: false,
                updatedAt: new Date(),
            },
        });

        // Clear cache
        await this.cache.del(this.cache.getUserKey(userId));
        await this.cache.del(this.cache.getUserByEmailKey(existingUser.email));

        this.logger.info('User account deleted and cache cleared', {
            userId,
            email: existingUser.email,
            traceId,
        });

        return {
            message: '账户已删除',
            userId,
        };
    }

    /**
     * Mark email as verified (helper for Auth module)
     */
    async markEmailVerified(userId: string): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { isEmailVerified: true },
        });

        // Clear cache to refresh user data
        await this.cache.del(this.cache.getUserKey(userId));

        this.logger.info('User email marked as verified', { userId });
    }

    /**
     * Update password directly (helper for Auth module password reset)
     */
    async updatePassword(userId: string, newPassword: string): Promise<void> {
        const hashedPassword = await this.passwordService.hashPassword(newPassword);

        await this.prisma.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword,
                updatedAt: new Date(),
            },
        });

        // Clear cache (security consideration)
        await this.cache.del(this.cache.getUserKey(userId));

        this.logger.info('Password updated directly', { userId });
    }

    /**
     * Generate secure random token
     */
    private generateSecureToken(): string {
        return randomBytes(32).toString('hex');
    }
}
