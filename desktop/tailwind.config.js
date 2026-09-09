/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#007AFF',
        loss: '#FF3B30',
        profit: '#34C759',
        'text-2': '#8E8E93',
        sep: '#C6C6C8',
        hairline: '#E5E5E5',
        fill: '#F2F2F7',
        grouped: '#EFEFF4',
      },
    },
  },
  plugins: [],
};
