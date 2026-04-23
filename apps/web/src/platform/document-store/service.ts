/**
 * DocumentStore - 文档元数据存储
 *
 * 管理打开文档的元数据（path, type, title）。
 * 不存储文件内容，内容由 EditorService 管理。
 */

import { Emitter } from '@/base/common/event';
import { ServiceBase } from '@/platform/base/service-base';
import { Service } from '@/platform/di';
import type { DocumentMetadata } from './types';

@Service({ singleton: true })
export class DocumentStore extends ServiceBase {
    private _documents = new Map<string, DocumentMetadata>();
    private _pathIndex = new Map<string, string>(); // path → id

    private readonly _onDidChange = new Emitter<void>();
    readonly onDidChange = this._onDidChange.event;

    put(id: string, meta: DocumentMetadata): void {
        const existing = this._documents.get(id);
        if (existing) {
            this._pathIndex.delete(existing.path);
        }
        this._documents.set(id, meta);
        this._pathIndex.set(meta.path, id);
        this._onDidChange.fire();
    }

    get(id: string): DocumentMetadata | undefined {
        return this._documents.get(id);
    }

    getByPath(path: string): DocumentMetadata | undefined {
        const id = this._pathIndex.get(path);
        if (!id) return undefined;
        return this._documents.get(id);
    }

    remove(id: string): boolean {
        const meta = this._documents.get(id);
        if (!meta) return false;
        this._pathIndex.delete(meta.path);
        this._documents.delete(id);
        this._onDidChange.fire();
        return true;
    }

    getAll(): DocumentMetadata[] {
        return [...this._documents.values()];
    }

    has(id: string): boolean {
        return this._documents.has(id);
    }

    override dispose(): void {
        this._documents.clear();
        this._pathIndex.clear();
        this._onDidChange.dispose();
        super.dispose();
    }
}
