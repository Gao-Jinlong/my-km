-- CreateTable
CREATE TABLE "otel_traces" (
    "id" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "root_span_id" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "attributes" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "otel_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otel_spans" (
    "id" TEXT NOT NULL,
    "span_id" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "parent_span_id" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "status_message" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "events" JSONB NOT NULL DEFAULT '[]',
    "links" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "otel_spans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "otel_traces_trace_id_key" ON "otel_traces"("trace_id");

-- CreateIndex
CREATE INDEX "otel_traces_start_time_idx" ON "otel_traces"("start_time" DESC);

-- CreateIndex
CREATE INDEX "otel_traces_trace_id_idx" ON "otel_traces"("trace_id");

-- CreateIndex
CREATE UNIQUE INDEX "otel_spans_span_id_key" ON "otel_spans"("span_id");

-- CreateIndex
CREATE INDEX "otel_spans_trace_id_idx" ON "otel_spans"("trace_id");

-- CreateIndex
CREATE INDEX "otel_spans_parent_span_id_idx" ON "otel_spans"("parent_span_id");

-- CreateIndex
CREATE INDEX "otel_spans_name_idx" ON "otel_spans"("name");

-- CreateIndex
CREATE INDEX "otel_spans_service_name_idx" ON "otel_spans"("service_name");

-- CreateIndex
CREATE INDEX "otel_spans_start_time_idx" ON "otel_spans"("start_time" DESC);

-- AddForeignKey
ALTER TABLE "otel_spans" ADD CONSTRAINT "otel_spans_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "otel_traces"("trace_id") ON DELETE CASCADE ON UPDATE CASCADE;
