#!/usr/bin/env tsx
/**
 * Project Documentation Index Generator
 * Scans docs, APIs, and config files to generate structured indexes
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

interface DocEntry {
    path: string;
    relativePath: string;
    title: string;
    category: 'spec' | 'technical' | 'readme';
    type: string;
    summary?: string;
    metadata?: Record<string, unknown>;
    headers: string[];
    wordCount: number;
    lastModified: string;
}

interface ApiEndpoint {
    path: string;
    method: string;
    summary: string;
    controller: string;
    file: string;
}

interface ConfigEntry {
    path: string;
    type: 'package' | 'tsconfig' | 'docker' | 'env';
    description: string;
    keyFields: string[];
}

// 1. Scan Markdown documents
function scanMarkdownDocuments(): DocEntry[] {
    const docs: DocEntry[] = [];
    const baseDir = join(process.cwd(), 'docs');

    function scanDir(dir: string, category: DocEntry['category']) {
        if (!existsSync(dir)) return;

        const entries = readdirSync(dir);

        for (const entry of entries) {
            const fullPath = join(dir, entry);
            const stat = statSync(fullPath);

            if (stat.isDirectory()) {
                scanDir(fullPath, category);
                continue;
            }

            if (!entry.endsWith('.md')) continue;

            const content = readFileSync(fullPath, 'utf-8');
            const relativePath = relative(baseDir, fullPath);

            // Extract title
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1].trim() : entry;

            // Extract metadata
            const metadata: Record<string, unknown> = {};
            const versionMatch = content.match(/\*\*版本\*\*:\s*([0-9.]+)/);
            const statusMatch = content.match(/\*\*状态\*\*:\s*(.+)/);
            if (versionMatch) metadata.version = versionMatch[1];
            if (statusMatch) metadata.status = statusMatch[1].trim();

            // Extract all headers
            const headers = content.match(/^#{1,3}\s+.+$/gm) || [];

            // Extract summary
            let summary = '';
            const descMatch = content.match(/>\s*\*\*状态\*\*:[^\n]+\n\n(.+?)\n/);
            if (descMatch) {
                summary = descMatch[1].trim();
            } else {
                const firstParagraph = content.match(/^#\s+.+\n\n(.+?\n)/);
                if (firstParagraph) {
                    summary = firstParagraph[1].trim();
                }
            }

            // Determine document type
            let type = 'general';
            if (relativePath.includes('api')) type = 'api';
            else if (relativePath.includes('database')) type = 'database';
            else if (relativePath.includes('frontend')) type = 'frontend';
            else if (relativePath.includes('cache')) type = 'cache';
            else if (relativePath.includes('i18n')) type = 'i18n';
            else if (relativePath.includes('authentication')) type = 'auth';
            else if (relativePath.includes('git')) type = 'git';
            else if (relativePath.includes('logging')) type = 'logging';
            else if (relativePath.includes('cors')) type = 'cors';
            else if (relativePath.includes('infrastructure')) type = 'infrastructure';
            else if (relativePath.includes('requirement')) type = 'requirements';
            else if (relativePath.includes('features')) type = 'features';
            else if (relativePath.includes('vision')) type = 'vision';
            else if (relativePath.includes('roadmap')) type = 'roadmap';

            docs.push({
                path: fullPath,
                relativePath: `docs/${relativePath}`,
                title,
                category,
                type,
                summary,
                metadata,
                headers: headers.map(h => h.replace(/^#{1,3}\s+/, '')),
                wordCount: content.split(/\s+/).length,
                lastModified: stat.mtime.toISOString(),
            });
        }
    }

    // Scan spec and technical directories
    if (existsSync(join(baseDir, 'spec'))) {
        scanDir(join(baseDir, 'spec'), 'spec');
    }
    if (existsSync(join(baseDir, 'technical'))) {
        scanDir(join(baseDir, 'technical'), 'technical');
    }

    // Scan README.md
    const readmePath = join(baseDir, 'README.md');
    if (existsSync(readmePath)) {
        const content = readFileSync(readmePath, 'utf-8');
        const titleMatch = content.match(/^#\s+(.+)$/m);
        docs.push({
            path: readmePath,
            relativePath: 'docs/README.md',
            title: titleMatch ? titleMatch[1].trim() : '文档中心',
            category: 'readme',
            type: 'index',
            summary: '项目文档导航中心',
            headers: content.match(/^#{1,3}\s+.+$/gm)?.map(h => h.replace(/^#{1,3}\s+/, '')) || [],
            wordCount: content.split(/\s+/).length,
            lastModified: statSync(readmePath).mtime.toISOString(),
        });
    }

    return docs;
}

// 2. Scan API endpoints from NestJS controllers
function scanApiEndpoints(): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const controllersDir = join(process.cwd(), 'apps/server/src');

    if (!existsSync(controllersDir)) {
        console.log('⚠️  Warning: apps/server/src directory not found, skipping API scan');
        return endpoints;
    }

    // Recursively scan all controller files
    function scanControllers(dir: string) {
        const entries = readdirSync(dir);

        for (const entry of entries) {
            const fullPath = join(dir, entry);
            const stat = statSync(fullPath);

            if (stat.isDirectory()) {
                // Skip non-source directories
                if (entry !== 'node_modules' && !entry.startsWith('.')) {
                    scanControllers(fullPath);
                }
                continue;
            }

            if (!entry.endsWith('.controller.ts')) continue;

            const content = readFileSync(fullPath, 'utf-8');
            const relativePath = relative(controllersDir, fullPath);

            // Extract controller name
            const controllerNameMatch = content.match(/@Controller\(['"]([^'"]+)['"]\)/);
            const controllerName = controllerNameMatch ? controllerNameMatch[1] : '';

            if (!controllerName) continue;

            // Extract all route methods
            const lines = content.split('\n');
            let currentSummary = '';
            let i = 0;

            while (i < lines.length) {
                const line = lines[i];

                // Extract JSDoc comment as summary
                const jsdocMatch = line.match(/^\s*\/\*\*\s*$/);
                if (jsdocMatch) {
                    i++;
                    while (i < lines.length && lines[i].includes('*')) {
                        const summaryMatch = lines[i].match(/\*\s*(.+)$/);
                        if (summaryMatch?.[1].trim() && !lines[i].includes('@')) {
                            currentSummary = summaryMatch[1].trim();
                            break;
                        }
                        i++;
                    }
                }

                // Extract route decorator
                const routeMatch = line.match(
                    /@(Get|Post|Patch|Put|Delete)\(['"]?([^'")]+)['"]?\)/,
                );
                if (routeMatch) {
                    const [, method, path] = routeMatch;
                    endpoints.push({
                        path: `/${controllerName}${path.startsWith('/') ? path : `/${path}`}`,
                        method: method.toUpperCase(),
                        summary: currentSummary || `${method.toUpperCase()} ${path}`,
                        controller: controllerName,
                        file: `apps/server/src/${relativePath}`,
                    });
                    currentSummary = '';
                }

                i++;
            }
        }
    }

    scanControllers(controllersDir);
    return endpoints;
}

// 3. Scan config files
function scanConfigFiles(): ConfigEntry[] {
    const configs: ConfigEntry[] = [];

    const configFiles = [
        { path: 'package.json', type: 'package' as const },
        { path: 'tsconfig.json', type: 'tsconfig' as const },
        { path: 'apps/server/package.json', type: 'package' as const },
        { path: 'apps/web/package.json', type: 'package' as const },
        { path: 'apps/server/tsconfig.json', type: 'tsconfig' as const },
        { path: 'apps/web/tsconfig.json', type: 'tsconfig' as const },
        { path: 'docker-compose.yml', type: 'docker' as const },
        { path: '.env.example', type: 'env' as const },
        { path: 'turbo.json', type: 'package' as const },
        { path: 'biome.json', type: 'package' as const },
        { path: 'pnpm-workspace.yaml', type: 'package' as const },
    ];

    for (const config of configFiles) {
        const fullPath = join(process.cwd(), config.path);
        if (!existsSync(fullPath)) continue;

        const content = readFileSync(fullPath, 'utf-8');
        let description = '';
        let keyFields: string[] = [];

        try {
            if (config.type === 'package') {
                const pkg = JSON.parse(content);
                description = pkg.description || `${config.path} configuration`;
                keyFields = Object.keys(pkg).filter(k =>
                    [
                        'name',
                        'version',
                        'scripts',
                        'dependencies',
                        'devDependencies',
                        'engines',
                    ].includes(k),
                );
            } else if (config.type === 'tsconfig') {
                description = 'TypeScript compiler configuration';
                const tsconfig = JSON.parse(content);
                keyFields = Object.keys(tsconfig).filter(k =>
                    ['compilerOptions', 'include', 'exclude', 'extends'].includes(k),
                );
            } else if (config.type === 'docker') {
                description = 'Docker service orchestration';
                const services = content.match(/(\w+):/g);
                keyFields = services ? services.map(s => s.replace(':', '')) : [];
            } else if (config.type === 'env') {
                description = 'Environment variable configuration example';
                keyFields = content
                    .split('\n')
                    .filter(line => line.trim() && !line.startsWith('#') && line.includes('='))
                    .map(line => line.split('=')[0].trim());
            }
        } catch {
            description = `${config.path} configuration file`;
        }

        configs.push({
            path: config.path,
            type: config.type,
            description,
            keyFields,
        });
    }

    return configs;
}

// 4. Generate main index
function generateIndex() {
    const docs = scanMarkdownDocuments();
    const apis = scanApiEndpoints();
    const configs = scanConfigFiles();

    // Generate document index
    const docIndex = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        summary: {
            totalDocs: docs.length,
            totalApis: apis.length,
            totalConfigs: configs.length,
            categories: {
                spec: docs.filter(d => d.category === 'spec').length,
                technical: docs.filter(d => d.category === 'technical').length,
                readme: docs.filter(d => d.category === 'readme').length,
            },
        },
        documents: docs,
    };

    // Generate API index
    const apiIndex = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        endpoints: apis,
        byController: apis.reduce(
            (acc, api) => {
                if (!acc[api.controller]) acc[api.controller] = [];
                acc[api.controller].push(api);
                return acc;
            },
            {} as Record<string, ApiEndpoint[]>,
        ),
        byMethod: apis.reduce(
            (acc, api) => {
                if (!acc[api.method]) acc[api.method] = [];
                acc[api.method].push(api);
                return acc;
            },
            {} as Record<string, ApiEndpoint[]>,
        ),
    };

    // Generate config index
    const configIndex = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        configs,
    };

    return { docIndex, apiIndex, configIndex };
}

// 5. Save indexes
function saveIndexes() {
    const { docIndex, apiIndex, configIndex } = generateIndex();
    const outputDir = join(process.cwd(), 'skills/project-docs/references');

    // Ensure output directory exists
    if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
    }

    // Save index files
    writeFileSync(join(outputDir, 'doc-index.json'), JSON.stringify(docIndex, null, 2), 'utf-8');
    writeFileSync(join(outputDir, 'api-index.json'), JSON.stringify(apiIndex, null, 2), 'utf-8');
    writeFileSync(
        join(outputDir, 'config-index.json'),
        JSON.stringify(configIndex, null, 2),
        'utf-8',
    );

    console.log('✅ Index generation successful!');
    console.log('');
    console.log(`📄 Document Index: ${docIndex.summary.totalDocs} files`);
    console.log(`   - spec: ${docIndex.summary.categories.spec} files`);
    console.log(`   - technical: ${docIndex.summary.categories.technical} files`);
    console.log(`   - readme: ${docIndex.summary.categories.readme} file`);
    console.log('');
    console.log(`🔌 API Index: ${apiIndex.endpoints.length} endpoints`);
    console.log(`   - controllers: ${Object.keys(apiIndex.byController).length} controllers`);
    console.log('');
    console.log(`⚙️  Config Index: ${configIndex.configs.length} files`);
    console.log('');
    console.log(`📂 Output directory: ${outputDir}`);

    return { docIndex, apiIndex, configIndex };
}

// Execute
if (require.main === module) {
    saveIndexes();
}

export { generateIndex, saveIndexes };
