import type { Config, Context } from '@netlify/functions';
import { normalizeTextForSpeech } from '../../src/services/audio/speechTextNormalizer';
import {
  checkRateLimit,
  getClientIp,
  getEnv,
  jsonResponse,
  sanitizeUserInput,
  verifyDemoAccess,
} from './_shared/security';

const OPENAI_TTS_INSTRUCTIONS =
  '日本の自動車販売店「オートギャラリー・ダイリン」の明るく丁寧で親しみやすい日本人女性営業スタッフとして、自然な日本語のイントネーションと聞き取りやすい落ち着いたテンポで話してください。';

async function requestOpenAiSpeech(
  apiKey: string,
  text: string,
  model: string,
  voice: string
): Promise<Response> {
  const payload: Record<string, unknown> = {
    model,
    voice,
    input: text,
    response_format: 'mp3',
  };
  if (model === 'gpt-4o-mini-tts') {
    payload.instructions = OPENAI_TTS_INSTRUCTIONS;
  }

  return fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  if (!verifyDemoAccess(req)) {
    return jsonResponse({ error: 'デモアクセス用のパスコードが正しくありません。' }, 401);
  }

  const ip = getClientIp(req, context);
  if (!checkRateLimit(`tts:${ip}`, 30, 60_000)) {
    return jsonResponse(
      { error: '音声生成のリクエストが集中しています。少し時間をおいてお試しください。' },
      429
    );
  }

  const openaiKey = getEnv('OPENAI_API_KEY', '').trim();
  if (!openaiKey || openaiKey === 'your_openai_api_key_here') {
    return jsonResponse(
      {
        error:
          'OpenAI APIキー（OPENAI_API_KEY）が未設定のため、文字チャットのみで動作しています。',
        code: 'OPENAI_NOT_CONFIGURED',
      },
      503
    );
  }

  const maxChars = Math.min(450, Math.max(80, Number(getEnv('MAX_TTS_CHARS_PER_TURN', '320')) || 320));

  let body: { text?: string; voice?: string };
  try {
    body = (await req.json()) as { text?: string; voice?: string };
  } catch {
    return jsonResponse({ error: 'リクエスト形式が不正です。' }, 400);
  }

  const rawText = sanitizeUserInput(body.text || '', maxChars);
  const text = normalizeTextForSpeech(rawText);
  if (!text) {
    return jsonResponse({ error: '読み上げテキストが空です。' }, 400);
  }

  const voice = body.voice || getEnv('OPENAI_TTS_VOICE', 'coral').trim() || 'coral';

  try {
    let upstream = await requestOpenAiSpeech(openaiKey, text, 'gpt-4o-mini-tts', voice);
    let activeModel = 'gpt-4o-mini-tts';

    if (!upstream.ok) {
      // フォールバックとして tts-1 (nova) を試行
      upstream = await requestOpenAiSpeech(openaiKey, text, 'tts-1', 'nova');
      activeModel = 'tts-1';
    }

    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => '');
      return jsonResponse(
        {
          error: `OpenAI音声生成エラー (${upstream.status})`,
          code: 'OPENAI_TTS_ERROR',
          detail: errBody.slice(0, 300),
        },
        upstream.status === 429 ? 429 : 502
      );
    }

    if (!upstream.body) {
      return jsonResponse({ error: '音声ストリームを受信できませんでした。' }, 502);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-TTS-Provider': 'openai',
        'X-Model-Id': activeModel,
        'X-Voice-Id': voice,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse(
      {
        error: 'OpenAI音声サーバーへの接続中に通信エラーが発生しました。',
        detail: message,
      },
      502
    );
  }
};

export const config: Config = {
  path: '/api/tts',
};
