import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import './config/load-env';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { I18nMiddleware } from './i18n';
import { LoggerService } from './logger/logger.service';
import { initTracing } from './tracing/tracing.init';

// OTel 必须在其他模块之前初始化
initTracing(() => {
    const { PrismaClient, PrismaPg } = require('@my-km/prisma') as typeof import('@my-km/prisma');
    return new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });
});

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        bufferLogs: true,
    });

    // 使用自定义 Logger Service
    const logger = await app.resolve(LoggerService);
    app.useLogger(logger);

    // 应用 I18n 中间件（需要在其他中间件之前）
    const i18nMiddleware = await app.resolve(I18nMiddleware);
    app.use((req: Request, res: Response, next: NextFunction) =>
        i18nMiddleware.use(req, res, next),
    );

    // 配置全局验证管道
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        }),
    );

    // 注册全局异常过滤器
    app.useGlobalFilters(new AllExceptionsFilter(logger));

    // 注册全局响应拦截器
    app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));

    // 配置全局前缀
    app.setGlobalPrefix('api');

    // 配置 Swagger
    const config = new DocumentBuilder()
        .setTitle('My KM API')
        .setDescription('Personal Knowledge Management API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();

    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, documentFactory, {
        customSiteTitle: 'My KM API Docs',
        swaggerOptions: {
            persistAuthorization: true,
            docExpansion: 'none',
            filter: true,
            showRequestDuration: true,
        },
    });

    // 配置 Socket.io WebSocket 适配器
    const ioAdapter = new IoAdapter(app);
    app.useWebSocketAdapter(ioAdapter);
    logger.log('Socket.io WebSocket adapter configured', 'Bootstrap');

    // 启用 CORS
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:4000'];

    app.enableCors({
        origin: (
            origin: string | undefined,
            callback: (err: Error | null, allow: boolean) => void,
        ) => {
            // 允许没有 origin 的请求（如移动应用、Postman 等）
            if (!origin) {
                return callback(null, true);
            }

            // 检查 origin 是否在允许列表中
            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error(`CORS: Origin ${origin} not allowed`), false);
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Locale', 'traceparent', 'tracestate'],
        exposedHeaders: ['Content-Range', 'X-Content-Range', 'traceparent'],
    });

    const port = process.env.PORT ?? 3000;
    await app.listen(port);

    // 记录启动信息
    logger.log('Application is running', 'Bootstrap', {
        url: `http://localhost:${port}`,
        port,
        environment: process.env.NODE_ENV || 'development',
    });
    logger.log('Swagger documentation', 'Bootstrap', {
        url: `http://localhost:${port}/api-docs`,
    });
}

void bootstrap();
