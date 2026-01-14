import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggerService } from './logger/logger.service';
import 'dotenv/config';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        bufferLogs: true,
    });

    // 使用自定义 Logger Service
    const logger = await app.resolve(LoggerService);
    app.useLogger(logger);

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

    // 配置 API 版本控制（可选）
    app.enableVersioning({
        type: VersioningType.URI,
        defaultVersion: '1',
    });

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

    // 启用 CORS
    app.enableCors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
        credentials: true,
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
