import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { EditorTabService } from '../service';

describe('EditorTabService', () => {
    let service: EditorTabService;

    beforeEach(() => {
        service = new EditorTabService();
    });

    afterEach(() => {
        service.dispose();
    });

    describe('openDocument', () => {
        it('应该添加新文档并激活', () => {
            const onOpen = vi.fn();
            const onActive = vi.fn();
            service.onDidOpenDocument(onOpen);
            service.onDidChangeActive(onActive);

            service.openDocument({ id: 'doc-1', title: 'Doc 1', openedAt: '2026-01-01' });

            expect(onOpen).toHaveBeenCalledWith({
                id: 'doc-1',
                title: 'Doc 1',
                openedAt: '2026-01-01',
            });
            expect(onActive).toHaveBeenCalledWith('doc-1');
            expect(service.getActiveDocumentId()).toBe('doc-1');
        });

        it('已打开的文档仅激活不重复添加', () => {
            service.openDocument({ id: 'doc-1', title: 'Doc 1', openedAt: '2026-01-01' });
            service.openDocument({ id: 'doc-2', title: 'Doc 2', openedAt: '2026-01-02' });

            const onOpen = vi.fn();
            service.onDidOpenDocument(onOpen);

            service.openDocument({ id: 'doc-1', title: 'Doc 1', openedAt: '2026-01-01' });

            expect(onOpen).not.toHaveBeenCalled();
            expect(service.getActiveDocumentId()).toBe('doc-1');
            expect(service.getOpenDocuments().length).toBe(2);
        });
    });

    describe('closeDocument', () => {
        it('应该关闭指定文档', () => {
            service.openDocument({ id: 'doc-1', title: 'Doc 1', openedAt: '2026-01-01' });
            service.openDocument({ id: 'doc-2', title: 'Doc 2', openedAt: '2026-01-02' });

            const onClose = vi.fn();
            service.onDidCloseDocument(onClose);

            service.closeDocument('doc-1');

            expect(onClose).toHaveBeenCalledWith('doc-1');
            expect(service.getOpenDocuments().length).toBe(1);
            expect(service.getOpenDocuments()[0].id).toBe('doc-2');
        });

        it('关闭激活文档应自动激活相邻文档', () => {
            service.openDocument({ id: 'doc-1', title: 'Doc 1', openedAt: '2026-01-01' });
            service.openDocument({ id: 'doc-2', title: 'Doc 2', openedAt: '2026-01-02' });
            service.openDocument({ id: 'doc-3', title: 'Doc 3', openedAt: '2026-01-03' });

            service.closeDocument('doc-2');

            expect(service.getActiveDocumentId()).toBe('doc-3');
        });

        it('关闭最后一个文档后 activeDocumentId 应为 null', () => {
            service.openDocument({ id: 'doc-1', title: 'Doc 1', openedAt: '2026-01-01' });

            service.closeDocument('doc-1');

            expect(service.getActiveDocumentId()).toBeNull();
            expect(service.getOpenDocuments().length).toBe(0);
        });

        it('关闭不存在的 id 应静默跳过', () => {
            service.openDocument({ id: 'doc-1', title: 'Doc 1', openedAt: '2026-01-01' });

            const onClose = vi.fn();
            service.onDidCloseDocument(onClose);

            service.closeDocument('non-existent');

            expect(onClose).not.toHaveBeenCalled();
            expect(service.getOpenDocuments().length).toBe(1);
        });
    });

    describe('activateDocument', () => {
        it('应激活指定文档', () => {
            service.openDocument({ id: 'doc-1', title: 'Doc 1', openedAt: '2026-01-01' });
            service.openDocument({ id: 'doc-2', title: 'Doc 2', openedAt: '2026-01-02' });
            // 先切回 doc-1（doc-2 打开后是激活状态）
            service.activateDocument('doc-1');

            const onActive = vi.fn();
            service.onDidChangeActive(onActive);

            service.activateDocument('doc-2');

            expect(onActive).toHaveBeenCalledWith('doc-2');
            expect(service.getActiveDocumentId()).toBe('doc-2');
        });

        it('激活同一文档应静默跳过', () => {
            service.openDocument({ id: 'doc-1', title: 'Doc 1', openedAt: '2026-01-01' });

            const onActive = vi.fn();
            service.onDidChangeActive(onActive);

            service.activateDocument('doc-1');

            expect(onActive).not.toHaveBeenCalled();
        });
    });

    describe('closeOtherDocuments', () => {
        it('应关闭除指定文档外的所有文档', () => {
            service.openDocument({ id: 'doc-1', title: 'Doc 1', openedAt: '2026-01-01' });
            service.openDocument({ id: 'doc-2', title: 'Doc 2', openedAt: '2026-01-02' });
            service.openDocument({ id: 'doc-3', title: 'Doc 3', openedAt: '2026-01-03' });

            service.closeOtherDocuments('doc-2');

            expect(service.getOpenDocuments().length).toBe(1);
            expect(service.getOpenDocuments()[0].id).toBe('doc-2');
            expect(service.getActiveDocumentId()).toBe('doc-2');
        });

        it('只有一个文档时应无操作', () => {
            service.openDocument({ id: 'doc-1', title: 'Doc 1', openedAt: '2026-01-01' });

            const onClose = vi.fn();
            service.onDidCloseDocument(onClose);

            service.closeOtherDocuments('doc-1');

            expect(onClose).not.toHaveBeenCalled();
        });
    });

    describe('closeAllDocuments', () => {
        it('应关闭所有文档', () => {
            service.openDocument({ id: 'doc-1', title: 'Doc 1', openedAt: '2026-01-01' });
            service.openDocument({ id: 'doc-2', title: 'Doc 2', openedAt: '2026-01-02' });

            const onClose = vi.fn();
            service.onDidCloseDocument(onClose);

            service.closeAllDocuments();

            expect(onClose).toHaveBeenCalledTimes(2);
            expect(service.getOpenDocuments().length).toBe(0);
            expect(service.getActiveDocumentId()).toBeNull();
        });

        it('没有文档时应无操作', () => {
            const onClose = vi.fn();
            service.onDidCloseDocument(onClose);

            service.closeAllDocuments();

            expect(onClose).not.toHaveBeenCalled();
        });
    });

    describe('getOpenDocuments', () => {
        it('应返回副本', () => {
            service.openDocument({ id: 'doc-1', title: 'Doc 1', openedAt: '2026-01-01' });

            const docs = service.getOpenDocuments();
            docs.push({ id: 'fake', title: 'Fake', openedAt: '' });

            expect(service.getOpenDocuments().length).toBe(1);
        });
    });

    describe('getActiveDocument', () => {
        it('应返回当前激活的文档信息', () => {
            service.openDocument({ id: 'doc-1', title: 'Doc 1', openedAt: '2026-01-01' });
            service.openDocument({ id: 'doc-2', title: 'Doc 2', openedAt: '2026-01-02' });
            service.activateDocument('doc-2');

            const active = service.getActiveDocument();

            expect(active).toBeDefined();
            expect(active?.id).toBe('doc-2');
            expect(active?.title).toBe('Doc 2');
        });

        it('没有激活文档时应返回 undefined', () => {
            expect(service.getActiveDocument()).toBeUndefined();
        });
    });
});
