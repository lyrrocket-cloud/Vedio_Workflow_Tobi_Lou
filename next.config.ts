import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ffmpeg-static 依赖运行时 __dirname 定位二进制；必须保持为外部包，
  // 否则 Turbopack 会把 __dirname 错误固化成构建占位路径导致 spawn ENOENT
  serverExternalPackages: ['ffmpeg-static'],
  // outputFileTracingRoot: path.resolve(__dirname, '../../'),  // Uncomment and add 'import path from "path"' if needed
  /* config options here */
  allowedDevOrigins: ['*.dev.coze.site', 'localhost', '127.0.0.1', 'all-in-one-42-vci-sqmlz'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lf-coze-web-cdn.coze.cn',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
