import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile, unlink, readdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

function log(stage: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [UPLOAD-CHUNK] [${stage}] ${message}`, data ? JSON.stringify(data) : '');
}

const CHUNKS_DIR = join(tmpdir(), 'upload-chunks');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const uploadId = formData.get('uploadId') as string;
    const chunkIndex = parseInt(formData.get('chunkIndex') as string, 10);
    const totalChunks = parseInt(formData.get('totalChunks') as string, 10);
    const chunk = formData.get('chunk') as File;

    if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !chunk) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // Ensure chunks directory exists
    const chunkDir = join(CHUNKS_DIR, uploadId);
    await mkdir(chunkDir, { recursive: true });

    // Write chunk to temp directory
    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());
    const chunkPath = join(chunkDir, `chunk_${String(chunkIndex).padStart(6, '0')}`);
    await writeFile(chunkPath, chunkBuffer);

    log('CHUNK_SAVED', '分块已保存', {
      uploadId,
      chunkIndex,
      totalChunks,
      chunkSize: `${(chunkBuffer.length / 1024).toFixed(2)}KB`,
    });

    return NextResponse.json({
      success: true,
      chunkIndex,
      received: chunkBuffer.length,
    });
  } catch (error) {
    log('ERROR', '分块上传失败', { error: error instanceof Error ? error.message : 'Unknown error' });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '分块上传失败' },
      { status: 500 }
    );
  }
}

// Clean up stale chunks (called by upload-complete)
export async function DELETE(request: NextRequest) {
  try {
    const { uploadId } = await request.json();
    if (!uploadId) {
      return NextResponse.json({ success: false, error: '缺少 uploadId' }, { status: 400 });
    }

    const chunkDir = join(CHUNKS_DIR, uploadId);
    const files = await readdir(chunkDir).catch(() => [] as string[]);
    
    for (const file of files) {
      await unlink(join(chunkDir, file)).catch(() => {});
    }
    
    const { rmdir } = await import('fs/promises');
    await rmdir(chunkDir).catch(() => {});

    log('CLEANUP', '分块已清理', { uploadId, fileCount: files.length });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: '清理失败' }, { status: 500 });
  }
}
