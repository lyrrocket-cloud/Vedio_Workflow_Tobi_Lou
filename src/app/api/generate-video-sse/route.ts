import { NextRequest } from 'next/server';
import { VideoGenerationClient, Config, HeaderUtils, Content } from 'coze-coding-dev-sdk';

interface GenerateVideoRequest {
  firstFrameUrl: string;
  lastFrameUrl: string;
  prompt: string;
  duration: number;
  resolution: string;
  ratio: string;
  generateAudio: boolean;
}

// SSE helper to send events
function sendEvent(controller: ReadableStreamDefaultController, event: string, data: Record<string, unknown>) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(message));
}

export async function POST(request: NextRequest) {
  const body: GenerateVideoRequest = await request.json();
  const { firstFrameUrl, lastFrameUrl, prompt, duration, resolution, ratio, generateAudio } = body;

  // Validate required fields
  if (!firstFrameUrl || !lastFrameUrl) {
    return new Response(JSON.stringify({ error: '首帧和尾帧图片URL是必需的' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      
      try {
        // Step 1: Initialize
        sendEvent(controller, 'status', {
          step: 'init',
          message: '初始化视频生成客户端...',
          timestamp: new Date().toISOString(),
          progress: 5,
        });

        // Extract headers for forwarding
        const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

        // Step 2: Prepare content
        sendEvent(controller, 'status', {
          step: 'prepare',
          message: '准备首尾帧图片数据...',
          timestamp: new Date().toISOString(),
          progress: 10,
        });

        // Prepare content with first and last frame images
        const content: Content[] = [
          {
            type: 'image_url',
            image_url: {
              url: firstFrameUrl,
            },
            role: 'first_frame',
          },
          {
            type: 'image_url',
            image_url: {
              url: lastFrameUrl,
            },
            role: 'last_frame',
          },
          {
            type: 'text',
            text: prompt || '场景之间平滑过渡',
          },
        ];

        // Step 3: Submit task
        sendEvent(controller, 'status', {
          step: 'submit',
          message: '提交视频生成任务到AI模型...',
          timestamp: new Date().toISOString(),
          progress: 15,
        });

        // Initialize video generation client
        const config = new Config();
        const client = new VideoGenerationClient(config, customHeaders as Record<string, string>);

        // Step 4: Processing - simulate progress updates
        sendEvent(controller, 'status', {
          step: 'processing',
          message: 'AI模型正在分析首尾帧图片...',
          timestamp: new Date().toISOString(),
          progress: 20,
        });

        // Start video generation (this will poll internally)
        const progressInterval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(85, 20 + Math.floor(elapsed / 5000) * 5); // Increase progress over time, max 85%
          
          const messages = [
            '正在生成转场动画...',
            '计算帧间过渡效果...',
            '渲染中间帧画面...',
            '优化视频流畅度...',
            '处理画面细节...',
            '生成动态效果...',
          ];
          
          const randomMessage = messages[Math.floor((elapsed / 3000) % messages.length)];
          
          sendEvent(controller, 'status', {
            step: 'processing',
            message: randomMessage,
            timestamp: new Date().toISOString(),
            progress,
            elapsed: Math.floor(elapsed / 1000),
          });
        }, 3000);

        // Generate video
        let response;
        try {
          response = await client.videoGeneration(content, {
            model: 'doubao-seedance-1-5-pro-251215',
            duration: duration || 5,
            resolution: resolution as '480p' | '720p' | '1080p' || '720p',
            ratio: ratio as '16:9' | '9:16' | '1:1' | '4:3' | '3:4' || '16:9',
            generateAudio: generateAudio ?? true,
            maxWaitTime: 900,
          });
        } finally {
          clearInterval(progressInterval);
        }

        // Step 5: Check result
        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        
        if (!response.videoUrl) {
          sendEvent(controller, 'error', {
            step: 'error',
            message: response.response?.error_message || '视频生成失败 - 未返回视频URL',
            timestamp: new Date().toISOString(),
            taskId: response.response?.id,
            status: response.response?.status,
          });
          controller.close();
          return;
        }

        // Step 6: Success
        sendEvent(controller, 'status', {
          step: 'finalizing',
          message: '视频生成完成，准备播放...',
          timestamp: new Date().toISOString(),
          progress: 95,
        });

        sendEvent(controller, 'complete', {
          step: 'complete',
          message: '转场视频生成成功！',
          timestamp: new Date().toISOString(),
          progress: 100,
          videoUrl: response.videoUrl,
          taskId: response.response.id,
          status: response.response.status,
          totalTime,
          duration: response.response.duration,
          resolution: response.response.resolution,
          ratio: response.response.ratio,
        });

        controller.close();
      } catch (error) {
        sendEvent(controller, 'error', {
          step: 'error',
          message: error instanceof Error ? error.message : '视频生成过程中发生错误',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.stack : String(error),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
