import './config/load-env';
import { initTracing } from './tracing/tracing.init';

initTracing(() => {
    const { PrismaClient, PrismaPg } = require('@my-km/prisma') as typeof import('@my-km/prisma');
    return new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });
});

void import('./main').then(({ bootstrap }) => bootstrap());
