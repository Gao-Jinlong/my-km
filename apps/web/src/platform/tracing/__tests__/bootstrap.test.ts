import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { getContainer } from '@/platform/bootstrap';
import { TracingService } from '../service';

describe('TracingService bootstrap registration', () => {
    it('resolves tracing service from the platform container', () => {
        const service = getContainer().get(TracingService);

        expect(service).toBeInstanceOf(TracingService);
        expect(getContainer().get(TracingService)).toBe(service);
    });
});
