/**
 * @WithSpan() — 方法级 OTel Span 装饰器
 *
 * 在 NestJS Service 方法上添加此装饰器，自动创建 Span：
 * - Span 名称默认为 `ClassName.methodName`
 * - 记录执行耗时
 * - 异常时设置 Span status = ERROR
 * - 可传入自定义 Span 名称和 attributes
 */

import type { SpanOptions } from '@opentelemetry/api';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

export interface WithSpanOptions {
    /** Span 名称，默认 `ClassName.methodName` */
    name?: string;
    /** 附加 attributes */
    attributes?: Record<string, string | number | boolean>;
}

export function WithSpan(options?: WithSpanOptions): MethodDecorator {
    return <T>(
        _target: object,
        propertyKey: string | symbol,
        descriptor: TypedPropertyDescriptor<T>,
    ): TypedPropertyDescriptor<T> => {
        const originalMethod = descriptor.value as unknown as (
            ...args: unknown[]
        ) => Promise<unknown>;
        const methodName = String(propertyKey);

        const wrapped = function (this: { constructor?: { name?: string } }, ...args: unknown[]) {
            const tracer = trace.getTracer('my-km-server');
            const spanName =
                options?.name ?? `${this.constructor?.name ?? 'Unknown'}.${methodName}`;

            const spanOptions: SpanOptions = {
                kind: SpanKind.INTERNAL,
            };

            const span = tracer.startSpan(spanName, spanOptions);

            if (options?.attributes) {
                span.setAttributes(options.attributes);
            }

            const promise = context.with(trace.setSpan(context.active(), span), () => {
                return originalMethod.apply(this, args);
            });

            return promise
                .then(result => {
                    span.end();
                    return result;
                })
                .catch((err: unknown) => {
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: err instanceof Error ? err.message : String(err),
                    });
                    span.recordException(err instanceof Error ? err : new Error(String(err)));
                    span.end();
                    throw err;
                });
        };

        descriptor.value = wrapped as unknown as T;
        return descriptor;
    };
}
