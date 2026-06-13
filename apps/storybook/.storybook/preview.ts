import { withThemeByDataAttribute } from '@storybook/addon-themes';
import type { Preview } from '@storybook/react';
import '@my-km/design-tokens/dist/tokens.css';

const preview: Preview = {
    parameters: {
        layout: 'centered',
        controls: { expanded: true },
    },
    decorators: [
        withThemeByDataAttribute({
            themes: { light: 'light', dark: 'dark' },
            defaultTheme: 'light',
            attributeName: 'data-theme',
        }),
    ],
};

export default preview;
