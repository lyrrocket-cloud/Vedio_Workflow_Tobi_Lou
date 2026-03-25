import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';

// Log helper with timestamp
function log(stage: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [UPLOAD] [${stage}] ${message}`, data ? JSON.stringify(data) : '');
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  log('START', '开始处理上传请求');
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      log('ERROR', '未找到文件');
      return NextResponse.json(
        { success: false, error: '请选择要上传的文件' },
        { status: 400 }
      );
    }

    log('FILE_INFO', '文件信息', {
      name: file.name,
      size: `${(file.size / 1024).toFixed(2)}KB`,
      type: file.type,
    });

    // Validate file type
    if (!file.type.startsWith('image/')) {
      log('ERROR', '文件类型不支持', { type: file.type });
      return NextResponse.json(
        { success: false, error: '只支持图片文件上传' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      log('ERROR', '文件大小超限', { size: file.size });
      return NextResponse.json(
        { success: false, error: '图片文件大小不能超过10MB' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    log('BUFFER_START', '开始转换为Buffer');
    const bufferStartTime = Date.now();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    log('BUFFER_DONE', 'Buffer转换完成', {
      duration: `${Date.now() - bufferStartTime}ms`,
      bufferSize: buffer.length,
    });

    // Initialize S3 storage
    log('S3_INIT', '初始化S3存储');
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });

    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `transition-frames/${timestamp}_${randomSuffix}.${ext}`;
    log('FILENAME', '生成文件名', { fileName });

    // Upload to object storage
    log('UPLOAD_START', '开始上传到对象存储');
    const uploadStartTime = Date.now();
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: file.type,
    });
    log('UPLOAD_DONE', '上传完成', {
      duration: `${Date.now() - uploadStartTime}ms`,
      key,
    });

    // Generate presigned URL for access (extended to 2 hours for video generation)
    log('URL_START', '开始生成预签名URL');
    const urlStartTime = Date.now();
    const url = await storage.generatePresignedUrl({
      key,
      expireTime: 7200, // 2 hours - enough time for video generation
    });
    log('URL_DONE', 'URL生成完成', {
      duration: `${Date.now() - urlStartTime}ms`,
      urlLength: url.length,
    });

    const totalTime = Date.now() - startTime;
    log('COMPLETE', '上传请求完成', { totalTime: `${totalTime}ms` });

    return NextResponse.json({
      success: true,
      url,
      key,
      uploadTime: totalTime,
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    log('ERROR', '上传失败', {
      totalTime: `${totalTime}ms`,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.error('Upload error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '上传失败，请重试' 
      },
      { status: 500 }
    );
  }
}
