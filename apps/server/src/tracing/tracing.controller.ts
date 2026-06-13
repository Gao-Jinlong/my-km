import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IngestSpansDto, QueryTracesDto } from './tracing.dto';
import { TracingService } from './tracing.service';

@Controller('traces')
export class TracingController {
    constructor(private readonly tracingService: TracingService) {}

    @Get()
    async listTraces(@Query() dto: QueryTracesDto) {
        return this.tracingService.queryTraces({
            threadId: dto.threadId,
            status: dto.status,
            from: dto.from,
            to: dto.to,
            page: dto.page ?? 1,
            pageSize: dto.pageSize ?? 20,
        });
    }

    @Get('stats')
    async getStats(@Query('from') from?: string, @Query('to') to?: string) {
        return this.tracingService.getStats(from, to);
    }

    @Get(':traceId')
    async getTrace(@Param('traceId') traceId: string) {
        return this.tracingService.getTrace(traceId);
    }

    @Post('spans')
    async ingestSpans(@Body() dto: IngestSpansDto) {
        if (dto.spans?.length) {
            await this.tracingService.ingestSpans(dto.spans);
        }
        return { success: true };
    }
}
