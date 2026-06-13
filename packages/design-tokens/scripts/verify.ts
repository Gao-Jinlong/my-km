import { tokenSchema } from '../src/schema';
import { themes } from '../src/themes';

let failed = false;
for (const [name, theme] of Object.entries(themes)) {
    const result = tokenSchema.safeParse(theme);
    if (!result.success) {
        failed = true;
        console.error(`Theme "${name}" failed:`, result.error.format());
    } else {
        console.log(`✓ ${name}`);
    }
}
process.exit(failed ? 1 : 0);
