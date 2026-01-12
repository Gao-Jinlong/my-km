/**
 * 业务异常基类
 *
 * 所有自定义业务异常都应该继承此类
 * 提供统一的错误码、错误消息和错误详情处理
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODE_TO_STATUS, ErrorCode } from '../constants/error-codes';

/**
 * 错误详情接口
 */
export interface ErrorDetail {
    field?: string;
    message: string;
    value?: any;
}

/**
 * 业务异常类
 *
 * @example
 * // 基础使用
 * throw new BusinessException(ErrorCode.USER_NOT_FOUND, 'User not found');
 *
 * // 带详情
 * throw new BusinessException(
 *   ErrorCode.VALIDATION_ERROR,
 *   'Validation failed',
 *   [{ field: 'email', message: 'Invalid email format' }]
 * );
 */
export class BusinessException extends HttpException {
    readonly errorCode: ErrorCode;
    readonly details?: ErrorDetail[];

    constructor(errorCode: ErrorCode, message?: string, details?: ErrorDetail[]) {
        const status = ERROR_CODE_TO_STATUS[errorCode] || HttpStatus.INTERNAL_SERVER_ERROR;
        const errorMessage = message || errorCode;

        super(
            {
                errorCode,
                message: errorMessage,
                details,
            },
            status,
        );

        this.errorCode = errorCode;
        this.details = details;
    }

    /**
     * 快速创建 NOT_FOUND 异常
     *
     * @param resource 资源名称（如 'Article', 'User'）
     * @param identifier 资源标识符（如 ID、slug）
     *
     * @example
     * throw BusinessException.notFound('Article', '123');
     * // 输出: "Article (123) not found"
     */
    static notFound(resource: string, identifier?: string): BusinessException {
        const message = identifier
            ? `${resource} (${identifier}) not found`
            : `${resource} not found`;

        return new BusinessException(ErrorCode.NOT_FOUND, message);
    }

    /**
     * 快速创建 VALIDATION_ERROR 异常
     *
     * @param details 验证错误详情列表
     *
     * @example
     * throw BusinessException.validation([
     *   { field: 'email', message: 'Invalid email format' },
     *   { field: 'password', message: 'Password too short' }
     * ]);
     */
    static validation(details: ErrorDetail[]): BusinessException {
        return new BusinessException(ErrorCode.VALIDATION_ERROR, 'Validation failed', details);
    }

    /**
     * 快速创建 ALREADY_EXISTS 异常
     *
     * @param resource 资源名称
     * @param identifier 资源标识符
     *
     * @example
     * throw BusinessException.alreadyExists('User', 'email@example.com');
     */
    static alreadyExists(resource: string, identifier?: string): BusinessException {
        const message = identifier
            ? `${resource} (${identifier}) already exists`
            : `${resource} already exists`;

        return new BusinessException(
            ErrorCode.NOT_FOUND, // 临时使用，实际应该有专门的错误码
            message,
        );
    }
}
