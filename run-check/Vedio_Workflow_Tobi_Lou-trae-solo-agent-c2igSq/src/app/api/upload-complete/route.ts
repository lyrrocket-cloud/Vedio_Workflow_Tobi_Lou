import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { readFile, readdir, unlink, rmdir, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

function log(stage: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [UPLOAD-COMPLETE] [${stage}] ${message}`, data ? JSON.stringify(data) : '');
}

const CHUNKS_DIR = join(tmpdir(), 'upload-chunks');

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { uploadId, fileName: rawFileName, contentType } = body;

    if (!uploadId) {
      return NextResponse.json({ success: false, error: '缺少 uploadId' }, { status: 400 });
    }

    const chunkDir = join(CHUNKS_DIR, uploadId);
    const files = await readdir(chunkDir).catch(() => [] as string[]);

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: '未找到上传的分块数据' }, { status: 400 });
    }

    // Sort chunks by index
    files.sort();

    log('ASSEMBLE_START', '开始组装分块', { uploadId, chunkCount: files.length });

    // Assemble all chunks into a single buffer
    const buffers: Buffer[] = [];
    for (const file of files) {
      const chunkPath = join(chunkDir, file);
      const chunkBuffer = await readFile(chunkPath);
      buffers.push(chunkBuffer);
    }

    const fullBuffer = Buffer.concat(buffers);
    log('ASSEMBLE_DONE', '分块组装完成', {
      totalSize: `${(fullBuffer.length / 1024 / 1024).toFixed(2)}MB`,
      chunkCount: files.length,
    });

    // Determine file type and folder
    const isImage = contentType?.startsWith('image/');
    const isVideo = contentType?.startsWith('video/');
    const isAudio = contentType?.startsWith('audio/');
    const folder = isVideo ? 'videos' : isAudio ? 'audios' : 'transition-frames';

    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const ext = rawFileName?.split('.').pop() || 'bin';
    const keyName = `${folder}/${timestamp}_${randomSuffix}.${ext}`;

    // Upload to S3
    log('S3_UPLOAD_START', '开始上传到S3', { keyName });
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });

    const key = await storage.uploadFile({
      fileContent: fullBuffer,
      fileName: keyName,
      contentType: contentType || 'application/octet-stream',
    });

    const url = await storage.generatePresignedUrl({ key, expireTime: 7200 });

    log('S3_UPLOAD_DONE', 'S3上传完成', { key, totalTime: `${Date.now() - startTime}ms` });

    // Clean up chunks
    try {
      for (const file of files) {
        await unlink(join(chunkDir, file)).catch(() => {});
      }
      await rmdir(chunkDir).catch(() => {});
    } catch (e) {
      log('CLEANUP_WARN', '清理分块时出现警告', { error: String(e) });
    }

    return NextResponse.json({
      success: true,
      url,
      key,
      uploadTime: Date.now() - startTime,
    });
  } catch (error) {
    log('ERROR', '组装上传失败', {
      totalTime: `${Date.now() - startTime}ms`,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '组装上传失败' },
      { status: 500 }
    );
  }
}
