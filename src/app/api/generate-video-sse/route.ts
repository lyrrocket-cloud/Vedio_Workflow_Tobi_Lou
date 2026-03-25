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
  mockMode?: boolean;
}

// SSE helper to send events
function sendEvent(controller: ReadableStreamDefaultController, event: string, data: Record<string, unknown>) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(message));
}

// Mock video generation for testing
async function mockVideoGeneration(
  controller: ReadableStreamDefaultController,
  startTime: number,
  duration: number,
  resolution: string,
  ratio: string
) {
  const steps = [
    { progress: 15, message: '初始化视频生成客户端...' },
    { progress: 20, message: '准备首尾帧图片数据...' },
    { progress: 30, message: 'AI模型正在分析首尾帧图片...' },
    { progress: 40, message: '正在生成转场动画...' },
    { progress: 50, message: '计算帧间过渡效果...' },
    { progress: 60, message: '渲染中间帧画面...' },
    { progress: 70, message: '优化视频流畅度...' },
    { progress: 80, message: '处理画面细节...' },
    { progress: 90, message: '视频生成完成，准备播放...' },
  ];

  for (const step of steps) {
    await new Promise(resolve => setTimeout(resolve, 800));
    sendEvent(controller, 'status', {
      step: 'processing',
      message: step.message,
      timestamp: new Date().toISOString(),
      progress: step.progress,
      elapsed: Math.floor((Date.now() - startTime) / 1000),
    });
  }

  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  
  // Return mock video URL
  sendEvent(controller, 'complete', {
    step: 'complete',
    message: '转场视频生成成功！(模拟模式)',
    timestamp: new Date().toISOString(),
    progress: 100,
    videoUrl: 'https://coze-coding-mockdata.tos-cn-beijing.volces.com/video_g1hsdk.mp4',
    taskId: `mock_${Date.now()}`,
    status: 'succeeded',
    totalTime,
    duration,
    resolution,
    ratio,
  });

  controller.close();
}

export async function POST(request: NextRequest) {
  const body: GenerateVideoRequest = await request.json();
  const { firstFrameUrl, lastFrameUrl, prompt, duration, resolution, ratio, generateAudio, mockMode } = body;

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
      
      // Step 1: Initialize
      sendEvent(controller, 'status', {
        step: 'init',
        message: mockMode ? '🧪 模拟模式：初始化视频生成...' : '初始化视频生成客户端...',
        timestamp: new Date().toISOString(),
        progress: 5,
      });

      // If mock mode, use mock generation
      if (mockMode) {
        await mockVideoGeneration(controller, startTime, duration || 5, resolution || '720p', ratio || '16:9');
        return;
      }

      try {
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
            text: prompt || '从首帧平滑过渡到尾帧，确保视频最后一帧与尾帧图片完全一致',
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
          const progress = Math.min(85, 20 + Math.floor(elapsed / 5000) * 5);
          
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
        const errorMessage = error instanceof Error ? error.message : '视频生成过程中发生错误';
        
        // Parse error details for better user feedback
        let userMessage = errorMessage;
        if (errorMessage.includes('403')) {
          userMessage = '⚠️ 视频生成服务权限不足。请尝试开启"模拟模式"进行测试，或联系管理员获取API权限。';
        } else if (errorMessage.includes('401')) {
          userMessage = '⚠️ API认证失败，请联系管理员';
        } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
          userMessage = '⚠️ 请求超时，请稍后重试';
        } else if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
          userMessage = '⚠️ 网络连接失败，请检查网络后重试';
        }
        
        sendEvent(controller, 'error', {
          step: 'error',
          message: userMessage,
          timestamp: new Date().toISOString(),
          progress: 0,
          error: errorMessage,
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
