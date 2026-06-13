import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryTracesDto {
    @IsOptional()
    @IsString()
    threadId?: string;

    @IsOptional()
    @IsString()
    status?: string;

    @IsOptional()
    @IsDateString()
    from?: string;

    @IsOptional()
    @IsDateString()
    to?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize?: number = 20;
}

export class IngestSpansDto {
    @IsOptional()
    spans?: Array<{
        spanId: string;
        traceId: string;
        parentSpanId?: string;
        name: string;
        kind: string;
        serviceName: string;
        startTime: string;
        endTime?: string;
        durationMs?: number;
        status?: string;
        statusMessage?: string;
        attributes?: Record<string, unknown>;
        events?: Array<{ name: string; time: string; attributes?: Record<string, unknown> }>;
        links?: Array<{ traceId: string; spanId: string }>;
    }>;
}
