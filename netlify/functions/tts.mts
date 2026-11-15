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
  | 'voicevox_mochiko'
  | 'voicevox_mochiko_happy'
  | 'voicevox_metan'
  | 'elevenlabs_female';

const VOICEVOX_SPEAKER_MAP: Record<string, number> = {
  voicevox_mochiko: 20, // もち子さん（ノーマル）
  voicevox_mochiko_happy: 79, // もち子さん（喜び）
  voicevox_metan: 2, // 四国めたん（ノーマル）
};

const ELEVENLABS_FEMALE_VOICE_ID = 'tmmztcupA9Eu81ix80hq';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function requestVoicevoxWebApi(speakerId: number, text: string): Promise<Response | null> {
  const apiKey = getEnv('VOICEVOX_API_KEY', '').trim();
  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
  const url = `https://api.tts.quest/v3/voicevox/synthesis?speaker=${speakerId}&text=${encodeURIComponent(text)}${keyParam}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      retryAfter?: number;
      mp3StreamingUrl?: string;
    };

    if (data.mp3StreamingUrl) {
      const audioRes = await fetch(data.mp3StreamingUrl);
      if (audioRes.ok && audioRes.body) {
        return audioRes;
      }
    }

    if (data.retryAfter && attempt < 2) {
      await sleep(Math.min(7000, (data.retryAfter + 1) * 1000));
      continue;
    }
    break;
  }
  return null;
}

async function requestElevenLabsJapaneseFemale(
  apiKey: string,
  text: string
): Promise<Response> {
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

  const requestedVoice = (body.voice || 'voicevox_mochiko') as FemaleVoiceOption;
  const speakerId = VOICEVOX_SPEAKER_MAP[requestedVoice];

  try {
    // 1. VOICEVOX（もち子さん / あいえるたん）
    if (speakerId !== undefined) {
      const vvRes = await requestVoicevoxWebApi(speakerId, text);
      if (vvRes && vvRes.body) {
        return new Response(vvRes.body, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'no-store',
            'X-TTS-Provider': 'voicevox',
            'X-Speaker-Id': String(speakerId),
            'X-Voice-Id': requestedVoice,
          },
        });
      }
    }

    // 2. ElevenLabs 専用女性ボイス（フォールバックまたは明示選択時）
    const elevenKey = getEnv('ELEVENLABS_API_KEY', '').trim();
    if (elevenKey && elevenKey !== 'your_elevenlabs_api_key_here') {
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

    return jsonResponse(
      {
        error: 'VOICEVOX音声サーバーが混雑しています。数秒おいて再度お試しください。',
        code: 'TTS_BUSY',
      },
      503
    );
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
