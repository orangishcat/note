const nextConfig = {
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
        else {
            const rules = [
                {
                    source: '/api/:path*',
                    destination: `${process.env.NEXT_PUBLIC_BACKEND_ENDPOINT}/api/:path*`,
                },
                {
                    source: '/static/:path*',
                    destination: `${process.env.NEXT_PUBLIC_BACKEND_ENDPOINT}/static/:path*`,
                },
            ];
            console.log(rules);
            return rules;
        }
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
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
        }
        catch {
        }
        return {
            remotePatterns: [
                {
                    protocol,
                    hostname: host,
                    ...(port ? { port } : {}),
                    pathname: '/**',
                },
            ],
        };
    })(),
  experimental: {
    turbo: {
      resolveAlias: {
        tone: "tone/build/esm/index.js",
      },
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      tone: "tone/build/esm/index.js",
    };
    return config;
  },
};
export default nextConfig;
