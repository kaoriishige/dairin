import type { Config, Context } from '@netlify/functions';
import { normalizeTextForGoogleCloudTts } from '../../src/services/audio/speechTextNormalizer';
import {
  checkRateLimit,
  getClientIp,
  getEnv,
  jsonResponse,
  sanitizeUserInput,
  verifyDemoAccess,
} from './_shared/security';

const GOOGLE_TTS_VOICE_NAME = 'ja-JP-Neural2-B';

async function synthesizeGoogleCloudJapaneseFemale(
  apiKey: string,
  text: string
): Promise<{ ok: boolean; status: number; audioBuffer?: Uint8Array; errorDetail?: string }> {
  const endpoint = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(
    apiKey
  )}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode: 'ja-JP',
        name: GOOGLE_TTS_VOICE_NAME,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.05,
        pitch: 0.4,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { ok: false, status: res.status, errorDetail: errText.slice(0, 300) };
  }

  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) {
    return { ok: false, status: 502, errorDetail: 'Empty audioContent from Google Cloud TTS' };
  }

  const binary = Buffer.from(data.audioContent, 'base64');
  return { ok: true, status: 200, audioBuffer: new Uint8Array(binary) };
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

  const googleKey = getEnv('GOOGLE_TTS_API_KEY', '').trim();
  if (!googleKey || googleKey === 'your_google_tts_api_key_here') {
    return jsonResponse(
      {
        error:
          'Google Cloud TTS APIキー（GOOGLE_TTS_API_KEY）が未設定のため、文字チャットのみで動作しています。',
        code: 'GOOGLE_TTS_NOT_CONFIGURED',
      },
      503
    );
  }

  const maxChars = Math.min(450, Math.max(80, Number(getEnv('MAX_TTS_CHARS_PER_TURN', '320')) || 320));

  let body: { text?: string };
  try {
    body = (await req.json()) as { text?: string };
  } catch {
    return jsonResponse({ error: 'リクエスト形式が不正です。' }, 400);
  }

  const rawText = sanitizeUserInput(body.text || '', maxChars);
  const text = normalizeTextForGoogleCloudTts(rawText);
  if (!text) {
    return jsonResponse({ error: '読み上げテキストが空です。' }, 400);
  }

  try {
    const result = await synthesizeGoogleCloudJapaneseFemale(googleKey, text);
    if (!result.ok || !result.audioBuffer) {
      return jsonResponse(
        {
          error: `Google Cloud TTS 音声生成エラー (${result.status})`,
          code: 'GOOGLE_TTS_ERROR',
          detail: result.errorDetail,
        },
        result.status === 429 ? 429 : 502
      );
    }

    const audioBlob = new Blob([result.audioBuffer as unknown as BlobPart], {
      type: 'audio/mpeg',
    });

    return new Response(audioBlob, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-TTS-Provider': 'google-cloud-tts',
        'X-Voice-Id': GOOGLE_TTS_VOICE_NAME,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown TTS error';
    return jsonResponse(
      {
        error: '音声ストリームの生成中にエラーが発生しました。文字チャットで継続します。',
        code: 'TTS_NETWORK_ERROR',
        detail: message,
      },
      502
    );
  }
};

export const config: Config = {
  path: '/api/tts',
};
