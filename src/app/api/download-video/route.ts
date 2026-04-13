import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const videoUrl = searchParams.get('url');

  if (!videoUrl) {
    return NextResponse.json({ error: '缺少视频URL参数' }, { status: 400 });
  }

  try {
    console.log(`[ARK-DOWNLOAD] 下载视频: ${videoUrl.slice(0, 100)}...`);

    const response = await fetch(videoUrl);

    if (!response.ok) {
      throw new Error(`下载失败: ${response.status}`);
    }

    const videoBuffer = await response.arrayBuffer();
    const videoData = Buffer.from(videoBuffer);

    console.log(`[ARK-DOWNLOAD] 下载完成, 大小: ${videoData.length} bytes`);

    return new NextResponse(videoData, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': videoData.length.toString(),
        'Content-Disposition': 'inline; filename="generated-video.mp4"',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error(`[ARK-DOWNLOAD] 下载失败: ${errorMessage}`);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
