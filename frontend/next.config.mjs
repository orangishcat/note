/** @type {import('next').NextConfig} */
const nextConfig = {
    // Dev-only rewrites to local Flask backend
    async rewrites() {
        if (process.env.NODE_ENV === 'development') {
            return [
                {
                    source: '/api/:path*',
                    destination: 'http://127.0.0.1:5000/api/:path*',
                },
                {
                    source: '/static/:path*',
                    destination: 'http://127.0.0.1:5000/static/:path*',
                },
            ];
        }
        // In SSR hosting (e.g., Appwrite Sites), leave paths unchanged
        return [];
    },

    // External image configuration for Appwrite Storage
    images: (() => {
        const fallback = 'https://cloud.appwrite.io/v1';
        const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || fallback;
        let host = 'cloud.appwrite.io';
        let protocol = 'https';
        let port;
        try {
            const u = new URL(endpoint);
            host = u.hostname;
            protocol = u.protocol.replace(':', '');
            port = u.port || undefined;
        } catch {
            // Ignore parse errors and use fallback values
        }
        return {
            remotePatterns: [
                {
                    protocol,
                    hostname: host,
                    ...(port ? { port } : {}),
                    // Allow any path beneath the endpoint (covers Storage file URLs)
                    pathname: '/**',
                },
            ],
        };
    })(),

    experimental: {
        testProxy: true,
    },
};

export default nextConfig;
