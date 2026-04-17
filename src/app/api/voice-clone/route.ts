import { NextRequest, NextResponse } from 'next/server';

// 火山引擎语音合成API配置
const VOLC_API_KEY = process.env.VOLC_API_KEY || 'be9ce267-c0d2-44b1-90f6-75964c4ec8fe';
const VOLC_BASE_URL = 'https://openspeech.bytedance.com/api/v3/voice';

// 音色ID
const VOICE_ID = 'S_Q3mBNb202';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: '请提供要合成的文本' }, { status: 400 });
    }

    // 调用火山引擎声音复刻API
    const response = await fetch(`${VOLC_BASE_URL}/cloned`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VOLC_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'chat',
        input: {
          text: text,
        },
        voice_setting: {
          voice_id: VOICE_ID,
          speed_ratio: 1.0,
          volume_ratio: 1.0,
          pitch_ratio: 1.0,
        },
        audio_setting: {
          sample_rate: 24000,
          audio_format: 'mp3',
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('火山引擎API错误:', errorData);
      return NextResponse.json(
        { error: `API调用失败: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
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
