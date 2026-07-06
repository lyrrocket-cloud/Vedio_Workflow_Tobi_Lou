import { NextRequest, NextResponse } from 'next/server';
import { VideoGenerationClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

interface GenerateVideoRequest {
  firstFrameUrl: string;
  lastFrameUrl: string;
  prompt: string;
  duration: number;
  resolution: string;
  ratio: string;
  generateAudio: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateVideoRequest = await request.json();
    const { firstFrameUrl, lastFrameUrl, prompt, duration, resolution, ratio, generateAudio } = body;

    // Validate required fields
    if (!firstFrameUrl || !lastFrameUrl) {
      return NextResponse.json(
        { success: false, error: 'First and last frame URLs are required' },
        { status: 400 }
      );
    }

    // Extract headers for forwarding
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    
    // Initialize video generation client
    const config = new Config();
    const client = new VideoGenerationClient(config, customHeaders as Record<string, string>);

    // Prepare content with first and last frame images
    const content = [
      {
        type: 'image_url' as const,
        image_url: {
          url: firstFrameUrl,
        },
        role: 'first_frame' as const,
      },
      {
        type: 'image_url' as const,
        image_url: {
          url: lastFrameUrl,
        },
        role: 'last_frame' as const,
      },
      {
        type: 'text' as const,
        text: prompt || 'Smooth transition between scenes',
      },
    ];

    // Generate video
    const response = await client.videoGeneration(content, {
      model: 'doubao-seedance-2-0-260128',
      duration: duration || 5,
      resolution: resolution as '480p' | '720p' | '1080p' || '720p',
      ratio: ratio as '16:9' | '9:16' | '1:1' | '4:3' | '3:4' || '16:9',
      maxWaitTime: 900, // 15 minutes max
    });

    if (!response.videoUrl) {
      return NextResponse.json(
        { success: false, error: 'Video generation failed - no video URL returned' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      videoUrl: response.videoUrl,
      taskId: response.response.id,
      status: response.response.status,
    });
  } catch (error) {
    console.error('Video generation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Video generation failed' 
      },
      { status: 500 }
    );
  }
}
