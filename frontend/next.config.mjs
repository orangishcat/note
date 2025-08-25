/** @type {import('next').NextConfig} */
const nextConfig = {
    // 1. Rewrites so /api and /static go to your Flask backend in dev
    rewrites: async () => {
        return [
            {
                source: '/api/:path*',
                destination:
                    process.env.NODE_ENV === 'development'
                        ? 'http://127.0.0.1:5000/api/:path*'
                        : '/api/',
            },
            {
                source: '/static/:path*',
                destination:
                    process.env.NODE_ENV === 'development'
                        ? 'http://127.0.0.1:5000/static/:path*'
                        : '/static/',
            },
        ];
    },

    // 2. External image configuration for Appwrite
    images: {
        // -- Parse the Appwrite endpoint into components. Fallback to the default
        // Appwrite cloud endpoint if the env variable isn't defined to avoid URL
        // construction errors during linting or builds.
        remotePatterns: [
            new URL(
                `${
                    process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ??
                    "https://cloud.appwrite.io/v1"
                }/**?project=**`
            ),
        ],
    },
    experimental: {
        testProxy: true,
    },
};

export default nextConfig;
