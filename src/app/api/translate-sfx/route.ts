import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// 独立的翻译API：将中文音效描述翻译为英文
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { prompt } = body;

  if (!prompt?.trim()) {
    return NextResponse.json({ error: '请输入音效描述' }, { status: 400 });
  }

  // 如果已经是英文，直接返回
  const isEnglish = /^[a-zA-Z0-9\s,.\-!?;:'"()]+$/.test(prompt.trim());
  if (isEnglish) {
    return NextResponse.json({ translated: prompt });
  }

  try {
    const config = new Config();
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const client = new LLMClient(config, customHeaders);

    const messages = [
      {
        role: 'system' as const,
        content: `You are an expert sound designer and audio engineer. Your task is to translate Chinese sound effect descriptions into English prompts optimized for AI audio generation models (like AudioFly).

Rules:
1. Translate the Chinese description to vivid, specific English sound effect descriptions
2. Use onomatopoeia and sensory words when appropriate (e.g., "whoosh", "crackle", "rumble", "sizzle")
3. Describe the sound qualities: timbre, pitch, volume, duration, texture
4. Include environmental context if mentioned (e.g., "distant", "echoing", "muffled")
5. Keep it concise but descriptive - aim for 1-3 sentences
6. Do NOT add explanations, notes, or quotation marks - output ONLY the English translation
7. Focus on WHAT the sound sounds like, not what makes the sound

Good examples:
- "雨滴打在窗户上，远处有雷声" → "Raindrops pattering against a glass window pane with distant rumbling thunder rolling across the sky"
- "猫叫声" → "A cat meowing softly, clear and close-up"
- "森林里的鸟鸣" → "Birds chirping and singing in a lush forest, natural ambient soundscape"`,
      },
      { role: 'user' as const, content: prompt },
    ];

    const response = await client.invoke(messages, {
      model: 'doubao-seed-1-8-251228',
      temperature: 0.3,
    });

    const translated = response.content.trim();

    return NextResponse.json({ translated });
  } catch (err) {
    console.error('[SFX-TRANSLATE] 翻译错误:', err);
    return NextResponse.json({ error: '翻译失败，请手动输入英文描述' }, { status: 500 });
  }
}
