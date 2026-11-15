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

export type FemaleVoiceOption = 'elevenlabs_female' | 'openai_nova' | 'openai_shimmer';

// ご自身のアカウントの専用日本人女性ボイス
const ELEVENLABS_FEMALE_VOICE_ID = 'tmmztcupA9Eu81ix80hq';

async function requestElevenLabsJapaneseFemale(
  apiKey: string,
  text: string
): Promise<Response> {
  // eleven_flash_v2_5 + language_code: 'ja' により日本語専用の自然な発音・高速生成を行う
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_FEMALE_VOICE_ID}/stream?output_format=mp3_44100_128`;
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5',
      language_code: 'ja',
      voice_settings: {
        stability: 0.58,
        similarity_boost: 0.82,
        style: 0.05,
        use_speaker_boost: true,
      },
    }),
  });
}

async function requestOpenAiFemaleSpeech(
  apiKey: string,
  text: string,
  voice: 'nova' | 'shimmer'
): Promise<Response> {
  // tts-1-hd の nova / shimmer は安定した女性声質（gpt-4o-mini-tts の日本語低音化を回避）
  return fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      voice,
      input: text,
      response_format: 'mp3',
      speed: 1.02,
    }),
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
  const elevenKey = getEnv('ELEVENLABS_API_KEY', '').trim();

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

  const requestedVoice = (body.voice || 'elevenlabs_female') as FemaleVoiceOption;

  try {
    // 1. ElevenLabs 専用日本人女性ボイスが選択されている場合
    if (requestedVoice === 'elevenlabs_female' && elevenKey && elevenKey !== 'your_elevenlabs_api_key_here') {
      const elRes = await requestElevenLabsJapaneseFemale(elevenKey, text);
      if (elRes.ok && elRes.body) {
        return new Response(elRes.body, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'no-store',
            'X-TTS-Provider': 'elevenlabs',
            'X-Model-Id': 'eleven_flash_v2_5',
            'X-Voice-Id': ELEVENLABS_FEMALE_VOICE_ID,
          },
        });
      }
    }

    // 2. OpenAI 女性ボイス (nova または shimmer / tts-1-hd)
    if (!openaiKey || openaiKey === 'your_openai_api_key_here') {
      return jsonResponse(
        {
          error: '音声APIキーが未設定のため、文字チャットのみで動作しています。',
          code: 'TTS_NOT_CONFIGURED',
        },
        503
      );
    }

    const openAiFemaleVoice: 'nova' | 'shimmer' =
      requestedVoice === 'openai_shimmer' ? 'shimmer' : 'nova';

    const upstream = await requestOpenAiFemaleSpeech(openaiKey, text, openAiFemaleVoice);

    if (!upstream.ok || !upstream.body) {
      const errBody = await upstream.text().catch(() => '');
      return jsonResponse(
        {
          error: `女性音声生成エラー (${upstream.status})`,
          code: 'TTS_ERROR',
          detail: errBody.slice(0, 300),
        },
        upstream.status === 429 ? 429 : 502
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-TTS-Provider': 'openai',
        'X-Model-Id': 'tts-1-hd',
        'X-Voice-Id': openAiFemaleVoice,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse(
      {
        error: '音声サーバーへの接続中に通信エラーが発生しました。',
        detail: message,
      },
      502
    );
  }
};

export const config: Config = {
  path: '/api/tts',
};
