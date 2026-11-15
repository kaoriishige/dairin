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

export type FemaleVoiceOption =
  | 'fn6Wir86vS59qP6PheHG'
  | 'U4eWfk1iaCTV9hveteMg'
  | 'tmmztcupA9Eu81ix80hq';

const ALLOWED_VOICE_IDS: FemaleVoiceOption[] = [
  'fn6Wir86vS59qP6PheHG',
  'U4eWfk1iaCTV9hveteMg',
  'tmmztcupA9Eu81ix80hq',
];

async function requestElevenLabsJapaneseFemale(
  apiKey: string,
  voiceId: string,
  text: string
): Promise<Response> {
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`;
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

  const elevenKey = getEnv('ELEVENLABS_API_KEY', '').trim();
  if (!elevenKey || elevenKey === 'your_elevenlabs_api_key_here') {
    return jsonResponse(
      {
        error:
          'ElevenLabs APIキー（ELEVENLABS_API_KEY）が未設定のため、文字チャットのみで動作しています。',
        code: 'ELEVENLABS_NOT_CONFIGURED',
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

  const activeVoiceId: FemaleVoiceOption = ALLOWED_VOICE_IDS.includes(
    body.voice as FemaleVoiceOption
  )
    ? (body.voice as FemaleVoiceOption)
    : 'fn6Wir86vS59qP6PheHG';

  try {
    const elRes = await requestElevenLabsJapaneseFemale(elevenKey, activeVoiceId, text);
    if (!elRes.ok || !elRes.body) {
      const errBody = await elRes.text().catch(() => '');
      return jsonResponse(
        {
          error: `ElevenLabs音声生成エラー (${elRes.status})`,
          code: 'ELEVENLABS_ERROR',
          detail: errBody.slice(0, 300),
        },
        elRes.status === 429 ? 429 : 502
      );
    }

    return new Response(elRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-TTS-Provider': 'elevenlabs',
        'X-Model-Id': 'eleven_flash_v2_5',
        'X-Voice-Id': activeVoiceId,
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
