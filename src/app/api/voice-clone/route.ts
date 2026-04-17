import { NextRequest, NextResponse } from 'next/server';

// 火山引擎语音合成API配置
const VOLC_API_KEY = process.env.VOLC_API_KEY || 'be9ce267-c0d2-44b1-90f6-75964c4ec8fe';
const VOLC_BASE_URL = 'https://openspeech.bytedance.com/api/v1/tts';

// 音色ID
const VOICE_ID = 'S_Q3mBNb202';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: '请提供要合成的文本' }, { status: 400 });
    }

    // 生成唯一请求ID
    const reqid = `${Date.now()}${Math.random().toString(36).substring(2, 10)}`;

    // 调用火山引擎声音复刻API
    const response = await fetch(VOLC_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': VOLC_API_KEY,
      },
      body: JSON.stringify({
        app: {
          cluster: 'volcano_icl',
        },
        user: {
          uid: '豆包语音',
        },
        audio: {
          voice_type: VOICE_ID,
          encoding: 'mp3',
          speed_ratio: 1.0,
        },
        request: {
          reqid: reqid,
          text: text,
          operation: 'submit',
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('火山引擎API错误:', response.status, errorData);
      return NextResponse.json(
        { error: `API调用失败: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('火山引擎响应:', data);
    
    return NextResponse.json({
      success: true,
      audioUrl: data.data?.audio_url || data.audio_url,
    });
  } catch (error) {
    console.error('配音生成错误:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '配音生成失败' },
      { status: 500 }
    );
  }
}
