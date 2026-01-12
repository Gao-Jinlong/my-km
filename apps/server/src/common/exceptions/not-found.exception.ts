/**
 * Not Found 异常类
 *
 * 用于资源不存在的场景
 * HTTP 404
 */

import { ErrorCode } from '../constants/error-codes';
import { BusinessException } from './business.exception';

/**
 * 通用 Not Found 异常
 *
 * @example
 * throw new NotFoundException('Article', '123');
 * // 输出: "Article (123) not found"
 */
export class NotFoundException extends BusinessException {
    constructor(resource: string, identifier?: string) {
        const message = identifier
            ? `${resource} (${identifier}) not found`
            : `${resource} not found`;
        super(ErrorCode.NOT_FOUND, message);
    }
}

// ============ 特定资源的 Not Found 异常 ============

/**
 * 文章不存在异常
 *
 * @example
 * throw new ArticleNotFoundException(articleId);
 */
export class ArticleNotFoundException extends NotFoundException {
    constructor(articleId: string) {
        super('Article', articleId);
    }
}

/**
 * 分类不存在异常
 *
 * @example
 * throw new CategoryNotFoundException(categoryId);
 */
export class CategoryNotFoundException extends NotFoundException {
    constructor(categoryId: string) {
        super('Category', categoryId);
    }
}

/**
 * 标签不存在异常
 *
 * @example
 * throw new TagNotFoundException(tagId);
 */
export class TagNotFoundException extends NotFoundException {
    constructor(tagId: string) {
        super('Tag', tagId);
    }
}

/**
 * 用户不存在异常
 *
 * @example
 * throw new UserNotFoundException(userId);
 */
export class UserNotFoundException extends NotFoundException {
    constructor(userId: string) {
        super('User', userId);
    }
}
