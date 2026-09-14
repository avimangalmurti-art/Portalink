export default {content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'SF Pro Display',
          'ui-sans-serif',
          'system-ui',
          'Segoe UI',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ]
      },
      /* Compatibility aliases for the semantic macOS text roles in index.css. */
      fontSize: {
        small: ['0.875rem', { lineHeight: '1.25rem' }],
        medium: ['1.0625rem', { lineHeight: '1.375rem' }],
        large: ['1.625rem', { lineHeight: '2rem' }],
        'cdx-dense-sm': ['0.875rem', { lineHeight: '1.3', fontWeight: '500' }],
        'cdx-dense-xs': ['0.75rem', { lineHeight: '1.2', fontWeight: '500' }],
        'cdx-dense-header': ['0.75rem', { lineHeight: '1.2', fontWeight: '700' }],
        'cdx-panel-title': ['0.9375rem', { lineHeight: '1.25', fontWeight: '600' }]
      },
      minHeight: {
        'cdx-row-md': '2.25rem',
        'cdx-row-sm': '2rem'
      }
    }
  }
}
