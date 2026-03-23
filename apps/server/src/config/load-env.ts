import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

const ENV_CANDIDATES = [
    resolve(process.cwd(), 'apps/server/.env.local'),
    resolve(process.cwd(), 'apps/server/.env'),
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env'),
];

for (const envPath of ENV_CANDIDATES) {
    if (!existsSync(envPath)) {
        continue;
    }

    loadDotenv({ path: envPath, override: false });
}
