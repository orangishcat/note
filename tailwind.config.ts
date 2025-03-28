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
                    50: 'hsl(240, 10%, 95%)',   // unchanged
                    100: 'hsl(240, 9%, 88%)',
                    200: 'hsl(240, 8%, 75%)',
                    300: 'hsl(240, 7%, 62%)',
                    400: 'hsl(240, 6%, 50%)',
                    500: 'hsl(240, 5%, 40%)',
                    600: 'hsl(240, 6%, 40%)',    // unchanged from previous
                    700: 'hsl(240, 7%, 30%)',
                    800: 'hsl(240, 8%, 20%)',
                    900: 'hsl(240, 10%, 12%)',
                },
                accent: {
                    50: 'hsl(240, 100%, 97%)',
                    100: 'hsl(240, 90%, 93%)',
                    200: 'hsl(240, 80%, 85%)',
                    300: 'hsl(240, 70%, 75%)',
                    400: 'hsl(240, 65%, 65%)',
                    500: 'hsl(240, 70%, 55%)',
                    600: 'hsl(240, 65%, 45%)',
                    700: 'hsl(240, 60%, 35%)',
                    800: 'hsl(240, 60%, 25%)',
                    900: 'hsl(240, 60%, 15%)',
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
