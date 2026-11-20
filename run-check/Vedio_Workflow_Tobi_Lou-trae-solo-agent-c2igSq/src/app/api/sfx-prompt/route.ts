import { NextRequest } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

// 图片理解模型（支持 Image 输入）
const VISION_MODEL = process.env.SFX_VISION_MODEL || "doubao-seed-2-0-pro-260215";

const SYSTEM_PROMPT = `你是一名专业的影视/游戏音效设计师。用户会给你一张截图（通常是视频或游戏画面），你的任务是为这个画面撰写一条用于「AI 音效生成模型」的音效提示词。

要求：
1. 只输出一条可直接使用的中文音效提示词，不要输出任何解释、标题、序号、引号或多余内容；
2. 准确捕捉画面中的场景、主体与氛围，描述该场景应该听到的环境声、动作声、氛围声等具体声音细节；
3. 提示词必须是【纯音效】：绝对不包含人声、语音、对白、旁白、歌声，也不包含背景音乐、BGM、旋律；
4. 语言自然流畅，50~150 字为宜。`;

interface SfxPromptBody {
  imageUrl?: string;
  imageData?: string; // data:image/xxx;base64,....
  hint?: string; // 用户补充的期望音效方向（可选）
}

export async function POST(request: NextRequest) {
  try {
    const body: SfxPromptBody = await request.json();
    const imageUrl = (body.imageUrl || "").trim();
    const imageData = (body.imageData || "").trim();
    const hint = (body.hint || "").trim();

    if (!imageUrl && !imageData) {
      return new Response(JSON.stringify({ error: "请先上传截图" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const imageSource = imageData || imageUrl;
    if (!imageData && !/^https?:\/\//i.test(imageSource)) {
      return new Response(JSON.stringify({ error: "截图地址不合法" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userText = hint
      ? `请根据这张截图生成一条音效提示词。用户期望的音效方向：${hint}`
      : "请根据这张截图生成一条音效提示词。";

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: userText },
          { type: "image_url" as const, image_url: { url: imageSource, detail: "high" as const } },
        ],
      },
    ];

    const stream = client.stream(messages, {
      model: VISION_MODEL,
      thinking: "disabled",
      temperature: 0.7,
    });

    // SSE 流式输出
    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.content ? chunk.content.toString() : "";
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "生成提示词失败";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "生成提示词失败";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
