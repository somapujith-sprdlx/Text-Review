export default {
  content: ['./src/**/*.{ts,tsx}', './public/**/*.html'],
  theme: {
    extend: {
      colors: {
        racing: {
          950: '#07281E', // deepest shadow / pressed state
          900: '#0B3D2E', // British racing green — primary
          800: '#0E4D3A', // lighter green — hover
          100: '#EDEADF', // cream panel background
          50: '#F5F0E1', // cream — page background
        },
        brass: {
          DEFAULT: '#C6A15B', // brushed brass accent — active/focus
          light: '#D9C285',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
}
