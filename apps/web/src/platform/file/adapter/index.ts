/**
 * 适配器模块统一导出
 */

// 环境检测导出
export { detectEnvironment, isWeb } from '../env/environment';

// 工厂函数导出
export {
    createAdapter,
    createMockAdapter,
    createWebAdapter,
} from './factory';
// 类型导出
export type {
    DirectoryEntry,
    DirectoryPickerOptions,
    FileInfo,
    FileReadResult,
    IFileSystemAdapter,
} from './types';
// 适配器类导出
export { WebAdapter } from './web/web-adapter';
