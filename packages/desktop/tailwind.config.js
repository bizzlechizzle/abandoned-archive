/**
 * Tailwind Configuration
 * Aligned with Abandoned Archive Design System
 * See: DESIGN.md and docs/DESIGN_SYSTEM.md
 */

import { skeleton } from '@skeletonlabs/tw-plugin';

export default {
  content: [
    './index.html',
    './src/**/*.{svelte,js,ts}',
    './node_modules/@skeletonlabs/skeleton/**/*.{html,js,svelte,ts}'
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Neutral Scale (used via CSS custom properties for theming)
        neutral: {
          50: '#f4f4f6',
          100: '#e4e4e8',
          200: '#c4c4cc',
          300: '#a3a3ad',
          400: '#85858f',
          500: '#5c5c66',
          600: '#404047',
          700: '#2e2e33',
          800: '#1f1f23',
          850: '#18181b',
          900: '#111113',
          950: '#0a0a0b',
        },
        // Accent Scale (Amber)
        accent: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          DEFAULT: '#fbbf24',
        },
        // Semantic Colors
        success: {
          DEFAULT: '#22c55e',
          muted: '#166534',
          light: '#dcfce7',
        },
        warning: {
          DEFAULT: '#eab308',
          muted: '#854d0e',
          light: '#fef9c3',
        },
        error: {
          DEFAULT: '#ef4444',
          muted: '#991b1b',
          light: '#fee2e2',
        },
        info: {
          DEFAULT: '#3b82f6',
          muted: '#1e40af',
          light: '#dbeafe',
        },
        // GPS Confidence Colors
        gps: {
          verified: '#22c55e',
          high: '#3b82f6',
          medium: '#eab308',
          low: '#ef4444',
          none: '#6b7280',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: ['11px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '20px' }],
        base: ['15px', { lineHeight: '24px' }],
        md: ['17px', { lineHeight: '24px' }],
        lg: ['20px', { lineHeight: '28px' }],
        xl: ['24px', { lineHeight: '32px' }],
        '2xl': ['30px', { lineHeight: '36px' }],
        '3xl': ['36px', { lineHeight: '40px' }],
        '4xl': ['48px', { lineHeight: '52px' }],
      },
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
        '16': '64px',
        '20': '80px',
        '24': '96px',
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',
        lg: '8px',
        xl: '12px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
        DEFAULT: '0 4px 6px rgba(0, 0, 0, 0.3)',
        md: '0 4px 6px rgba(0, 0, 0, 0.3)',
        lg: '0 10px 15px rgba(0, 0, 0, 0.3)',
      },
      transitionDuration: {
        instant: '0ms',
        fast: '100ms',
        normal: '150ms',
        slow: '250ms',
        slower: '350ms',
      },
      transitionTimingFunction: {
        'ease-out': 'cubic-bezier(0.25, 0, 0.25, 1)',
        'ease-in': 'cubic-bezier(0.5, 0, 0.75, 0)',
        'ease-in-out': 'cubic-bezier(0.45, 0, 0.55, 1)',
      },
      zIndex: {
        dropdown: '100',
        sticky: '200',
        'modal-backdrop': '300',
        modal: '400',
        popover: '500',
        tooltip: '600',
        toast: '700',
      },
    },
  },
  plugins: [skeleton],
};
