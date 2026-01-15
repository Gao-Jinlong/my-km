import { Global, Module } from '@nestjs/common';
import { I18nMiddleware } from './i18n.middleware';
import { I18nService } from './i18n.service';

@Global()
@Module({
    providers: [I18nService, I18nMiddleware],
    exports: [I18nService, I18nMiddleware],
})
export class I18nModule {}
