import { skeleton } from '@skeletonlabs/tw-plugin';

export default {
  content: [
    './index.html',
    './src/**/*.{svelte,js,ts}',
    './node_modules/@skeletonlabs/skeleton/**/*.{html,js,svelte,ts}'
  ],
  theme: {
    extend: {
      colors: {
        accent: '#b9975c',
        background: '#fffbf7',
        foreground: '#454545',
        primary: '#2563eb',
        secondary: '#64748b',
        danger: '#dc2626',
        success: '#16a34a',
      },
    },
  },
  plugins: [skeleton],
};
