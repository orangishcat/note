import type {Config} from "tailwindcss";

import tailwindcss_animate from "tailwindcss-animate";

const config: Config = {
      darkMode: ["class"],
      content: [
          "./pages/**/*.{js,ts,jsx,tsx,mdx}",
          "./components/**/*.{js,ts,jsx,tsx,mdx}",
          "./app/**/*.{js,ts,jsx,tsx,mdx}",
      ],
      theme: {
          extend: {
              colors: {
                  background: 'var(--background)',
                  foreground: 'var(--foreground)',
                  card: {
                      DEFAULT: 'var(--card)',
                      foreground: 'var(--card-foreground)'
                  },
                  popover: {
                      DEFAULT: 'var(--popover)',
                      foreground: 'var(--popover-foreground)'
                  },
                  primary: {
                      DEFAULT: 'var(--primary)',
                      foreground: 'var(--primary-foreground)'
                  },
                  secondary: {
                      DEFAULT: 'var(--secondary)',
                      foreground: 'var(--secondary-foreground)'
                  },
                  muted: {
                      DEFAULT: 'var(--muted)',
                      foreground: 'var(--muted-foreground)'
                  },
                  accent: {
                      DEFAULT: 'var(--accent)',
                      foreground: 'var(--accent-foreground)'
                  },
                  destructive: {
                      DEFAULT: 'var(--destructive)',
                      foreground: 'var(--destructive-foreground)'
                  },
                  border: 'var(--border)',
                  input: 'var(--input)',
                  ring: 'var(--ring)',
                  chart: {
                      '1': 'var(--chart-1)',
                      '2': 'var(--chart-2)',
                      '3': 'var(--chart-3)',
                      '4': 'var(--chart-4)',
                      '5': 'var(--chart-5)'
                  },
                  gray: {
                      50: 'hsl(240, 5%, 98%)',
                      100: 'hsl(240, 4%, 93%)',
                      200: 'hsl(230, 6%, 86%)',
                      300: 'hsl(230, 6%, 76%)',
                      400: 'hsl(230, 6%, 63%)',
                      500: 'hsl(235, 5%, 51%)',
                      600: 'hsl(235, 6%, 38%)',
                      700: 'hsl(235, 6%, 29%)',
                      800: 'hsl(235, 7%, 20%)',
                      900: 'hsl(240, 10%, 13%)',
                  },
          },
          borderRadius: {
              lg: 'var(--radius)',
              md: 'calc(var(--radius) - 2px)',
              sm: 'calc(var(--radius) - 4px)'
          },
      }
  },
  plugins: [
      tailwindcss_animate
  ],
  };
export default config;
