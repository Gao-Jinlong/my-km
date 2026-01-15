import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 获取当前请求的语言
 * 使用方式: @CurrentLocale() locale: string
 */
export const CurrentLocale = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): string => {
        const request = ctx.switchToHttp().getRequest();
        return request.locale || 'zh-CN';
    },
);
