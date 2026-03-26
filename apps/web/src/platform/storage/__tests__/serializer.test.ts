import { describe, expect, it } from 'vitest';
import type { StorageEntry } from '../types';
import { deserialize, isExpired, serialize } from '../utils/serializer';

describe('Serializer', () => {
    it('应序列化基本类型', () => {
        expect(serialize('hello')).toBe(JSON.stringify('hello'));
        expect(serialize(42)).toBe(JSON.stringify(42));
        expect(serialize(true)).toBe(JSON.stringify(true));
    });

    it('应序列化对象', () => {
        const obj = { name: 'test', value: 123 };
        expect(serialize(obj)).toBe(JSON.stringify(obj));
    });

    it('应反序列化', () => {
        const str = JSON.stringify({ foo: 'bar' });
        expect(deserialize(str)).toEqual({ foo: 'bar' });
    });

    it('应处理过期检查', () => {
        const expired: StorageEntry = {
            value: 'test',
            timestamp: Date.now(),
            expiresAt: Date.now() - 1000,
        };
        const notExpired: StorageEntry = {
            value: 'test',
            timestamp: Date.now(),
            expiresAt: Date.now() + 10000,
        };

        expect(isExpired(expired)).toBe(true);
        expect(isExpired(notExpired)).toBe(false);
    });

    it('无过期时间的条目不应过期', () => {
        const entry: StorageEntry = {
            value: 'test',
            timestamp: Date.now(),
        };
        expect(isExpired(entry)).toBe(false);
    });
});
