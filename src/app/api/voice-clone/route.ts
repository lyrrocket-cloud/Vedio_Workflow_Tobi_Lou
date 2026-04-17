import { NextRequest, NextResponse } from 'next/server';

// 火山引擎语音合成API配置 (V3版本)
const VOLC_API_KEY = process.env.VOLC_API_KEY || 'be9ce267-c0d2-44b1-90f6-75964c4ec8fe';
const VOLC_BASE_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse';

// 音色ID
const VOICE_ID = 'S_Q3mBNb202';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: '请提供要合成的文本' }, { status: 400 });
    }

    // 生成唯一请求ID (UUID格式)
    const requestId = crypto.randomUUID();

    console.log('开始配音生成，请求ID:', requestId, '文本:', text);

    // 使用SSE协议调用火山引擎TTS API
    const response = await fetch(VOLC_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': VOLC_API_KEY,
        'X-Api-Request-Id': requestId,
        'X-Api-Resource-Id': 'seed-icl-2.0',
      },
      body: JSON.stringify({
        model: 'chat',
        voice_type: VOICE_ID,
        input: {
          text: text,
        },
        audio_setting: {
          sample_rate: 24000,
          encoding: 'mp3',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('火山引擎API错误:', response.status, errorText);
      return NextResponse.json(
        { error: `API调用失败: ${response.status}` },
        { status: response.status }
      );
    }

    // SSE响应需要处理流式数据
    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: '无法读取响应' }, { status: 500 });
    }

    const chunks: Uint8Array[] = [];
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // 合并所有数据块
    const combined = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
    let position = 0;
    for (const chunk of chunks) {
      combined.set(chunk, position);
      position += chunk.length;
    }

    const textContent = decoder.decode(combined);
    console.log('SSE响应内容长度:', textContent.length);

    // 解析SSE数据
    const audioDataMatches = textContent.match(/data:\s*(.+?)(?:\n\n|\n$)/gs);
    
    if (audioDataMatches && audioDataMatches.length > 0) {
      // 提取最后一个非空的data行
      for (const match of audioDataMatches) {
        const data = match.replace(/^data:\s*/, '').trim();
        if (data && data !== '[DONE]') {
          console.log('提取到音频数据,长度:', data.length);
          // 返回base64音频数据
          return NextResponse.json({
            success: true,
            audioUrl: `data:audio/mp3;base64,${data}`,
          });
        }
      }
    }

    // 如果没有找到音频数据，尝试直接返回整个响应作为base64
    const base64Data = textContent.trim();
    if (base64Data.length > 100) {
      return NextResponse.json({
        success: true,
        audioUrl: `data:audio/mp3;base64,${base64Data}`,
      });
    }

    console.error('未找到音频数据，响应内容:', textContent.substring(0, 500));
    return NextResponse.json({ error: '未获取到音频数据' }, { status: 500 });

  } catch (error) {
    console.error('配音生成错误:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '配音生成失败' },
      { status: 500 }
    );
  }
}
