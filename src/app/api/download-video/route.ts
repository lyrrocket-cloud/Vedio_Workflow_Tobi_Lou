import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const videoUrl = searchParams.get('url');

  if (!videoUrl) {
    return NextResponse.json({ error: '缺少视频URL参数' }, { status: 400 });
  }

  try {
    // 从对象存储下载视频
    const response = await fetch(videoUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('下载视频失败:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        url: videoUrl.substring(0, 100) + '...',
      });
      throw new Error(`下载失败: ${response.status} ${response.statusText}`);
    }

    // 获取视频blob
    const blob = await response.blob();

    // 检查是否是视频类型
    const contentType = response.headers.get('content-type') || 'video/mp4';
    if (!contentType.startsWith('video/')) {
      console.error('下载的不是视频文件:', { contentType });
      throw new Error('下载的不是有效的视频文件');
    }

    // 返回视频blob给前端
    return new NextResponse(blob, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="video-${Date.now()}.mp4"`,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '下载视频失败';
    console.error('下载视频异常:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      url: videoUrl.substring(0, 100) + '...',
    });

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
