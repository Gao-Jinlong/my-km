import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CacheModule } from './cache/cache.module';
import { ConfigModule } from './config/config.module';
import { I18nModule } from './i18n';
import { LoggerMiddleware } from './logger/logger.middleware';
import { LoggerModule } from './logger/logger.module';
import { PrismaModule } from './prisma/prisma.module';
import { TracingModule } from './tracing/tracing.module';
import { UsersModule } from './users/users.module';

@Module({
    imports: [
        ConfigModule,
        LoggerModule,
        PrismaModule,
        CacheModule,
        UsersModule,
        AuthModule,
        I18nModule,
        AiModule,
        TracingModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(LoggerMiddleware).forRoutes('*');
    }
}
