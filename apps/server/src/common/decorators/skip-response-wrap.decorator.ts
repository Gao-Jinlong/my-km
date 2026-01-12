/**
 * 跳过响应封装装饰器
 *
 * 用于特定接口（如 SSE、文件下载等）跳过全局响应拦截器的封装
 *
 * @example
 * // SSE 接口
 * @SkipResponseWrap()
 * @Sse('events')
 * streamEvents() {
 *   return Observable;
 * }
 *
 * @example
 * // 文件下载
 * @SkipResponseWrap()
 * @Get('download')
 * downloadFile() {
 *   return new StreamableFile(buffer);
 * }
 */

import { SetMetadata } from '@nestjs/common';

export const SKIP_RESPONSE_WRAP_KEY = 'skipResponseWrap';

/**
 * 跳过响应封装装饰器
 *
 * 使用此装饰器的接口将不会经过 TransformInterceptor 处理
 * 直接返回原始响应数据
 */
export const SkipResponseWrap = () => SetMetadata(SKIP_RESPONSE_WRAP_KEY, true);
