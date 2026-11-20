import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

const DATA_DIR = process.env.DATA_STORAGE_PATH || '/app/data';
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string[] }> }
) {
  const { name } = await params;
  const relativePath = name.join('/');

  // 只允许安全字符，避免路径穿越
  if (!/^[A-Za-z0-9._/-]+$/.test(relativePath) || relativePath.includes('..')) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const buffer = await readFile(path.join(UPLOAD_DIR, relativePath));
    const ext = relativePath.split('.').pop()?.toLowerCase() ?? '';
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=7200',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
