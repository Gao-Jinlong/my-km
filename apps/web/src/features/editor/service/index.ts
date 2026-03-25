/**
 * Editor Service Module
 *
 * Business logic service for single editor instance
 */

export {
    type AutoSaveOptions,
    type AutoSaveService,
    createAutoSaveService,
    SaveStatus,
} from './AutoSaveService';
export type { EditorService, SaveResult } from './EditorService';
export { createEditorService } from './EditorService';
