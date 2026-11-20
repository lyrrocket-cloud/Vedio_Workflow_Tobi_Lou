import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import type { NextRequest } from 'next/server';

// 上传文件保存在 NAS 容器卷内（docker-compose 挂载 /app/data）
const DATA_DIR = process.env.DATA_STORAGE_PATH || '/app/data';
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

// 生成对外可访问的绝对地址（火山方舟等外部服务需要拉取文件）
// frp 会把 X-Forwarded-Proto 改写为 http，nginx 额外透传 X-Forwarded-Scheme
export function getBaseUrl(request: NextRequest) {
  const proto =
    request.headers.get('x-forwarded-scheme') ??
    request.headers.get('x-forwarded-proto') ??
    request.nextUrl.protocol.replace(':', '');
  const host =
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    request.nextUrl.host;
  return `${proto}://${host}`;
}

export async function saveUploadFile(key: string, data: Buffer) {
  const filePath = path.join(UPLOAD_DIR, key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
  return filePath;
}

export function getUploadUrl(request: NextRequest, key: string) {
  return `${getBaseUrl(request)}/api/uploads/${key}`;
}
