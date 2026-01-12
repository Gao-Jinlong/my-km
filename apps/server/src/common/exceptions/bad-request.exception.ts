/**
 * Bad Request 异常类
 *
 * 用于请求参数错误、验证失败等场景
 * HTTP 400
 */

import { ErrorCode } from '../constants/error-codes';
import { BusinessException, ErrorDetail } from './business.exception';

/**
 * 通用 Bad Request 异常
 *
 * @example
 * throw new BadRequestException('Invalid parameter');
 *
 * @example
 * throw new BadRequestException('Invalid parameter', [
 *   { field: 'email', message: 'Invalid email format' }
 * ]);
 */
export class BadRequestException extends BusinessException {
    constructor(message: string, details?: ErrorDetail[]) {
        super(ErrorCode.INVALID_INPUT, message, details);
    }
}

/**
 * 验证失败异常
 *
 * @example
 * throw new ValidationException([
 *   { field: 'email', message: 'Invalid email format' },
 *   { field: 'password', message: 'Password too short' }
 * ]);
 */
export class ValidationException extends BadRequestException {
    constructor(details: ErrorDetail[]) {
        super('Validation failed', details);
    }
}

/**
 * 缺少必需字段异常
 *
 * @example
 * throw new MissingFieldException('title');
 */
export class MissingFieldException extends BadRequestException {
    constructor(fieldName: string) {
        super(`Missing required field: ${fieldName}`, [
            { field: fieldName, message: 'This field is required' },
        ]);
    }
}

/**
 * 格式错误异常
 *
 * @example
 * throw new InvalidFormatException('email', 'invalid-email');
 */
export class InvalidFormatException extends BadRequestException {
    constructor(fieldName: string, value: any, expectedFormat?: string) {
        const message = expectedFormat
            ? `Invalid format for ${fieldName}. Expected: ${expectedFormat}`
            : `Invalid format for ${fieldName}`;

        super(message, [{ field: fieldName, message, value }]);
    }
}
