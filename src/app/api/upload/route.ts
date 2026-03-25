import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '请选择要上传的文件' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: '只支持图片文件上传' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: '图片文件大小不能超过10MB' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Initialize S3 storage
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

    // Upload to object storage
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: file.type,
    });

    // Generate presigned URL for access (extended to 2 hours for video generation)
    const url = await storage.generatePresignedUrl({
      key,
      expireTime: 7200, // 2 hours - enough time for video generation
    });

    console.log('Image uploaded successfully:', { key, urlLength: url.length });

    return NextResponse.json({
      success: true,
      url,
      key,
    });
  } catch (error) {
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
