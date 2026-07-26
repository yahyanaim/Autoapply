const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;
if (configuredApiUrl) {
  const parsedApiUrl = new URL(configuredApiUrl);
  const isLocal = parsedApiUrl.hostname === 'localhost' || parsedApiUrl.hostname === '127.0.0.1';
  if (!isLocal && parsedApiUrl.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_API_URL must use HTTPS outside local development');
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

module.exports = nextConfig;
