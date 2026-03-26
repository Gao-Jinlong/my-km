// apps/web/src/platform/storage/utils/serializer.ts

import { StorageSerializationError } from '../errors';
import type { SerializedEntry, StorageEntry } from '../types';

export function serialize<T>(value: T): string {
    try {
        return JSON.stringify(value);
    } catch (_error) {
        throw new StorageSerializationError('无法序列化值', value);
    }
}

export function deserialize<T>(data: string): T {
    try {
        return JSON.parse(data) as T;
    } catch (_error) {
        throw new StorageSerializationError('无法反序列化值', data);
    }
}

export function serializeEntry<T>(entry: StorageEntry<T>): SerializedEntry {
    return {
        value: serialize(entry.value),
        timestamp: entry.timestamp,
        expiresAt: entry.expiresAt,
    };
}

export function deserializeEntry<T>(data: string): StorageEntry<T> {
    const parsed = deserialize<SerializedEntry>(data);
    return {
        value: deserialize<T>(parsed.value),
        timestamp: parsed.timestamp,
        expiresAt: parsed.expiresAt,
    };
}

export function isExpired(entry: StorageEntry): boolean {
    if (!entry.expiresAt) return false;
    return Date.now() > entry.expiresAt;
}
