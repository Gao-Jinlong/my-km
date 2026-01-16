import { redirect as nextRedirect } from 'next/navigation';
import { routing } from '@/i18n/routing';

export default function RootPage() {
    // Redirect to the default locale
    // next-intl middleware handles automatic locale detection
    // This is a fallback that uses the default locale
    nextRedirect(`/${routing.defaultLocale}`);
}
