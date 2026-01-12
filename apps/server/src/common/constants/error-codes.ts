/**
 * 错误码枚举
 *
 * 格式: {模块}_{具体错误}
 * 日志级别映射: FATAL > ERROR > WARN
 *
 * 参考 docs/technical/logging-standard.md 中的日志级别定义
 */

/**
 * 错误码枚举
 *
 * 分类：
 * - FATAL: 系统无法继续运行的错误
 * - ERROR: 业务流程中的错误
 * - WARN: 潜在问题或异常情况
 */
export enum ErrorCode {
    // ============ 系统级错误 (FATAL) ============
    SYSTEM_FATAL = 'SYSTEM_FATAL',
    DATABASE_CONNECTION_FAILED = 'DATABASE_CONNECTION_FAILED',
    CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',

    // ============ 通用错误 (ERROR) ============
    INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
    UNAUTHORIZED = 'UNAUTHORIZED',
    FORBIDDEN = 'FORBIDDEN',
    NOT_FOUND = 'NOT_FOUND',
    METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
    REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',

    // ============ 验证错误 (WARN) ============
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    INVALID_INPUT = 'INVALID_INPUT',
    MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
    INVALID_FORMAT = 'INVALID_FORMAT',

    // ============ 文章相关 (ERROR/WARN) ============
    ARTICLE_NOT_FOUND = 'ARTICLE_NOT_FOUND',
    ARTICLE_ALREADY_EXISTS = 'ARTICLE_ALREADY_EXISTS',
    ARTICLE_INVALID_STATUS = 'ARTICLE_INVALID_STATUS',

    // ============ 分类相关 (ERROR/WARN) ============
    CATEGORY_NOT_FOUND = 'CATEGORY_NOT_FOUND',
    CATEGORY_HAS_CHILDREN = 'CATEGORY_HAS_CHILDREN',
    CATEGORY_ALREADY_EXISTS = 'CATEGORY_ALREADY_EXISTS',

    // ============ 标签相关 (ERROR/WARN) ============
    TAG_NOT_FOUND = 'TAG_NOT_FOUND',
    TAG_ALREADY_EXISTS = 'TAG_ALREADY_EXISTS',

    // ============ 用户相关 (ERROR/WARN) ============
    USER_NOT_FOUND = 'USER_NOT_FOUND',
    USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
    INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',

    // ============ AI 相关 (ERROR/WARN) ============
    AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
    AI_QUOTA_EXCEEDED = 'AI_QUOTA_EXCEEDED',
    EMBEDDING_ERROR = 'EMBEDDING_ERROR',

    // ============ 限流错误 (WARN) ============
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
    TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',

    // ============ 认证相关 (ERROR/WARN) ============
    AUTH_EMAIL_NOT_VERIFIED = 'AUTH_EMAIL_NOT_VERIFIED',
    AUTH_WEAK_PASSWORD = 'AUTH_WEAK_PASSWORD',
    AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
    AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
    AUTH_ACCOUNT_LOCKED = 'AUTH_ACCOUNT_LOCKED',
    AUTH_EMAIL_ALREADY_EXISTS = 'AUTH_EMAIL_ALREADY_EXISTS',
    AUTH_SESSION_NOT_FOUND = 'AUTH_SESSION_NOT_FOUND',
}

/**
 * 错误码到 HTTP 状态码的映射
 */
export const ERROR_CODE_TO_STATUS: Record<ErrorCode, number> = {
    // ============ FATAL/ERROR -> 500 ============
    [ErrorCode.SYSTEM_FATAL]: 500,
    [ErrorCode.DATABASE_CONNECTION_FAILED]: 503,
    [ErrorCode.CONFIGURATION_ERROR]: 500,
    [ErrorCode.INTERNAL_SERVER_ERROR]: 500,

    // ============ 401/403 ============
    [ErrorCode.UNAUTHORIZED]: 401,
    [ErrorCode.FORBIDDEN]: 403,

    // ============ 404 ============
    [ErrorCode.NOT_FOUND]: 404,
    [ErrorCode.ARTICLE_NOT_FOUND]: 404,
    [ErrorCode.CATEGORY_NOT_FOUND]: 404,
    [ErrorCode.TAG_NOT_FOUND]: 404,
    [ErrorCode.USER_NOT_FOUND]: 404,

    // ============ 405 ============
    [ErrorCode.METHOD_NOT_ALLOWED]: 405,

    // ============ 408 ============
    [ErrorCode.REQUEST_TIMEOUT]: 408,

    // ============ 400 (Validation) ============
    [ErrorCode.VALIDATION_ERROR]: 400,
    [ErrorCode.INVALID_INPUT]: 400,
    [ErrorCode.MISSING_REQUIRED_FIELD]: 400,
    [ErrorCode.INVALID_FORMAT]: 400,

    // ============ 409 (Conflict) ============
    [ErrorCode.ARTICLE_ALREADY_EXISTS]: 409,
    [ErrorCode.CATEGORY_ALREADY_EXISTS]: 409,
    [ErrorCode.CATEGORY_HAS_CHILDREN]: 400,
    [ErrorCode.TAG_ALREADY_EXISTS]: 409,
    [ErrorCode.USER_ALREADY_EXISTS]: 409,

    // ============ 422 (Unprocessable Entity) ============
    [ErrorCode.ARTICLE_INVALID_STATUS]: 422,
    [ErrorCode.INVALID_CREDENTIALS]: 422,

    // ============ AI 错误 ============
    [ErrorCode.AI_SERVICE_ERROR]: 502,
    [ErrorCode.AI_QUOTA_EXCEEDED]: 429,
    [ErrorCode.EMBEDDING_ERROR]: 502,

    // ============ 429 (Rate Limit) ============
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
    [ErrorCode.TOO_MANY_REQUESTS]: 429,

    // ============ 认证相关 ============
    [ErrorCode.AUTH_EMAIL_NOT_VERIFIED]: 403,
    [ErrorCode.AUTH_WEAK_PASSWORD]: 400,
    [ErrorCode.AUTH_TOKEN_INVALID]: 401,
    [ErrorCode.AUTH_TOKEN_EXPIRED]: 401,
    [ErrorCode.AUTH_ACCOUNT_LOCKED]: 403,
    [ErrorCode.AUTH_EMAIL_ALREADY_EXISTS]: 409,
    [ErrorCode.AUTH_SESSION_NOT_FOUND]: 401,
};

/**
 * 错误码到日志级别的映射
 */
export const ERROR_CODE_TO_LOG_LEVEL: Record<ErrorCode, 'fatal' | 'error' | 'warn'> = {
    // ============ FATAL ============
    [ErrorCode.SYSTEM_FATAL]: 'fatal',
    [ErrorCode.DATABASE_CONNECTION_FAILED]: 'fatal',
    [ErrorCode.CONFIGURATION_ERROR]: 'fatal',

    // ============ ERROR ============
    [ErrorCode.INTERNAL_SERVER_ERROR]: 'error',
    [ErrorCode.UNAUTHORIZED]: 'error',
    [ErrorCode.FORBIDDEN]: 'error',
    [ErrorCode.NOT_FOUND]: 'error',
    [ErrorCode.ARTICLE_NOT_FOUND]: 'error',
    [ErrorCode.CATEGORY_NOT_FOUND]: 'error',
    [ErrorCode.CATEGORY_HAS_CHILDREN]: 'error',
    [ErrorCode.TAG_NOT_FOUND]: 'error',
    [ErrorCode.USER_NOT_FOUND]: 'error',
    [ErrorCode.ARTICLE_ALREADY_EXISTS]: 'error',
    [ErrorCode.CATEGORY_ALREADY_EXISTS]: 'error',
    [ErrorCode.TAG_ALREADY_EXISTS]: 'error',
    [ErrorCode.USER_ALREADY_EXISTS]: 'error',
    [ErrorCode.METHOD_NOT_ALLOWED]: 'error',
    [ErrorCode.REQUEST_TIMEOUT]: 'error',
    [ErrorCode.ARTICLE_INVALID_STATUS]: 'error',
    [ErrorCode.INVALID_CREDENTIALS]: 'error',
    [ErrorCode.AI_SERVICE_ERROR]: 'error',
    [ErrorCode.EMBEDDING_ERROR]: 'error',
    [ErrorCode.AUTH_EMAIL_ALREADY_EXISTS]: 'error',

    // ============ WARN ============
    [ErrorCode.VALIDATION_ERROR]: 'warn',
    [ErrorCode.INVALID_INPUT]: 'warn',
    [ErrorCode.MISSING_REQUIRED_FIELD]: 'warn',
    [ErrorCode.INVALID_FORMAT]: 'warn',
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 'warn',
    [ErrorCode.TOO_MANY_REQUESTS]: 'warn',
    [ErrorCode.AI_QUOTA_EXCEEDED]: 'warn',
    [ErrorCode.AUTH_EMAIL_NOT_VERIFIED]: 'warn',
    [ErrorCode.AUTH_WEAK_PASSWORD]: 'warn',
    [ErrorCode.AUTH_TOKEN_INVALID]: 'warn',
    [ErrorCode.AUTH_TOKEN_EXPIRED]: 'warn',
    [ErrorCode.AUTH_ACCOUNT_LOCKED]: 'warn',
    [ErrorCode.AUTH_SESSION_NOT_FOUND]: 'warn',
};

/**
 * 错误码默认消息（可选，用于国际化）
 */
export const ERROR_CODE_MESSAGES: Record<ErrorCode, string> = {
    [ErrorCode.SYSTEM_FATAL]: 'System encountered a fatal error',
    [ErrorCode.DATABASE_CONNECTION_FAILED]: 'Database connection failed',
    [ErrorCode.CONFIGURATION_ERROR]: 'Configuration error',
    [ErrorCode.INTERNAL_SERVER_ERROR]: 'Internal server error',
    [ErrorCode.UNAUTHORIZED]: 'Unauthorized access',
    [ErrorCode.FORBIDDEN]: 'Access forbidden',
    [ErrorCode.NOT_FOUND]: 'Resource not found',
    [ErrorCode.METHOD_NOT_ALLOWED]: 'Method not allowed',
    [ErrorCode.REQUEST_TIMEOUT]: 'Request timeout',
    [ErrorCode.VALIDATION_ERROR]: 'Validation failed',
    [ErrorCode.INVALID_INPUT]: 'Invalid input',
    [ErrorCode.MISSING_REQUIRED_FIELD]: 'Missing required field',
    [ErrorCode.INVALID_FORMAT]: 'Invalid format',
    [ErrorCode.ARTICLE_NOT_FOUND]: 'Article not found',
    [ErrorCode.ARTICLE_ALREADY_EXISTS]: 'Article already exists',
    [ErrorCode.ARTICLE_INVALID_STATUS]: 'Invalid article status',
    [ErrorCode.CATEGORY_NOT_FOUND]: 'Category not found',
    [ErrorCode.CATEGORY_HAS_CHILDREN]: 'Category has children',
    [ErrorCode.CATEGORY_ALREADY_EXISTS]: 'Category already exists',
    [ErrorCode.TAG_NOT_FOUND]: 'Tag not found',
    [ErrorCode.TAG_ALREADY_EXISTS]: 'Tag already exists',
    [ErrorCode.USER_NOT_FOUND]: 'User not found',
    [ErrorCode.USER_ALREADY_EXISTS]: 'User already exists',
    [ErrorCode.INVALID_CREDENTIALS]: 'Invalid credentials',
    [ErrorCode.AI_SERVICE_ERROR]: 'AI service error',
    [ErrorCode.AI_QUOTA_EXCEEDED]: 'AI quota exceeded',
    [ErrorCode.EMBEDDING_ERROR]: 'Embedding error',
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded',
    [ErrorCode.TOO_MANY_REQUESTS]: 'Too many requests',
    [ErrorCode.AUTH_EMAIL_NOT_VERIFIED]: 'Email not verified',
    [ErrorCode.AUTH_WEAK_PASSWORD]: 'Password is too weak',
    [ErrorCode.AUTH_TOKEN_INVALID]: 'Invalid token',
    [ErrorCode.AUTH_TOKEN_EXPIRED]: 'Token has expired',
    [ErrorCode.AUTH_ACCOUNT_LOCKED]: 'Account is locked',
    [ErrorCode.AUTH_EMAIL_ALREADY_EXISTS]: 'Email already exists',
    [ErrorCode.AUTH_SESSION_NOT_FOUND]: 'Session not found',
};
