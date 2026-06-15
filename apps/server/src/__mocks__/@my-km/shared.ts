/**
 * Jest manual mock for @my-km/shared AI tool definitions.
 *
 * Keep this aligned with packages/shared/src/ai/tools/* exports. Server AI tests only need
 * name/description/inputSchema shape so tool-definitions.ts can build LangChain tools.
 */
export const fileOpsTool = {
    name: 'file_ops',
    description: 'Mock file operations tool',
    inputSchema: { type: 'object', properties: {}, required: [] },
};

export const docReadTool = {
    name: 'doc_read',
    description: 'Mock document read tool',
    inputSchema: { type: 'object', properties: {}, required: [] },
};

export const docEditTool = {
    name: 'doc_edit',
    description: 'Mock document edit tool',
    inputSchema: { type: 'object', properties: {}, required: [] },
};

export const searchTool = {
    name: 'search',
    description: 'Mock search tool',
    inputSchema: { type: 'object', properties: {}, required: [] },
};
