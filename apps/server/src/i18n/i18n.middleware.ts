import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { DEFAULT_LOCALE } from './constants/locales';
import { I18nService } from './i18n.service';

// 扩展 Express Request 类型
declare global {
    namespace Express {
        interface Request {
            locale?: string;
        }
    }
}

@Injectable()
export class I18nMiddleware implements NestMiddleware {
    constructor(private readonly i18nService: I18nService) {}

    use(req: Request, _res: Response, next: NextFunction) {
        // 1. 首先检查自定义 header X-Locale
        const xLocale = req.headers['x-locale'] as string;
        if (xLocale && this.i18nService.isValidLocale(xLocale)) {
            req.locale = xLocale;
            return next();
        }

        // 2. 检查查询参数 locale
        const queryLocale = req.query.locale as string;
        if (queryLocale && this.i18nService.isValidLocale(queryLocale)) {
            req.locale = queryLocale;
            return next();
        }

        // 3. 检查 Accept-Language 请求头
        const acceptLanguage = req.headers['accept-language'] as string;
        const detectedLocale = this.i18nService.detectLocaleFromHeader(acceptLanguage);
        req.locale = detectedLocale;

        next();
    }
}
