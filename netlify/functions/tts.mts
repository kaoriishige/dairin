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

export type CuteFemaleVoicePreset =
  | 'cartesia-suzuka-bright'
  | 'cartesia-rin-bright'
  | 'cartesia-misaki-bright'
  | 'cartesia-hina-bright';

const CARTESIA_VOICE_IDS: Record<CuteFemaleVoicePreset, string> = {
  // ① 明るく弾む受付嬢（Suzuka）
  'cartesia-suzuka-bright': '156fdc17-0578-45d7-b0f4-94ec18d3e07c',
  // ② 親しみやすい明るい女性（Rin）
  'cartesia-rin-bright': '7be83d14-4707-43ad-9774-e24eb38320f0',
  // ③ ハキハキ明るくクリア（Misaki）
  'cartesia-misaki-bright': 'c433cb19-7a58-47fa-8f86-49414a49e908',
  // ④ 優しく丁寧で明るい女性（Hina）
  'cartesia-hina-bright': '7f822e9a-d00c-45fe-84e4-d59a3ac664d4',
};

async function synthesizeCartesiaJapaneseBright(
  apiKey: string,
  voiceId: string,
  text: string
): Promise<{ ok: boolean; status: number; audioBuffer?: Uint8Array; errorDetail?: string }> {
  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'Cartesia-Version': '2024-06-10',
      'X-API-Key': apiKey,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model_id: 'sonic-latest',
      transcript: text,
      language: 'ja',
      voice: {
        mode: 'id',
        id: voiceId,
        __experimental_controls: {
          speed: 'fast',
          emotion: ['positivity:highest', 'curiosity:high'],
        },
      },
      output_format: {
        container: 'mp3',
        sample_rate: 44100,
        bit_rate: 128000,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { ok: false, status: res.status, errorDetail: errText.slice(0, 300) };
  }

  const arr = await res.arrayBuffer();
  if (arr.byteLength < 500) {
    return { ok: false, status: 502, errorDetail: 'Empty audio from Cartesia' };
  }

  return {
    ok: true,
    status: 200,
    audioBuffer: new Uint8Array(arr),
  };
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

  const cartesiaKey = getEnv('CARTESIA_API_KEY', '').trim();
  if (!cartesiaKey) {
    return jsonResponse(
      {
        error: '音声APIキー（CARTESIA_API_KEY）が未設定のため、文字チャットで継続します。',
        code: 'TTS_NOT_CONFIGURED',
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

  const requestedVoice = body.voice as CuteFemaleVoicePreset | undefined;
  const activePreset: CuteFemaleVoicePreset =
    requestedVoice && requestedVoice in CARTESIA_VOICE_IDS
      ? requestedVoice
      : 'cartesia-suzuka-bright';

  const cartesiaVoiceId = CARTESIA_VOICE_IDS[activePreset];

  try {
    const cartesiaResult = await synthesizeCartesiaJapaneseBright(
      cartesiaKey,
      cartesiaVoiceId,
      text
    );

    if (!cartesiaResult.ok || !cartesiaResult.audioBuffer) {
      return jsonResponse(
        {
          error: `音声生成エラー (${cartesiaResult.status})`,
          code: 'TTS_ERROR',
          detail: cartesiaResult.errorDetail,
        },
        502
      );
    }

    const audioBlob = new Blob([cartesiaResult.audioBuffer as unknown as BlobPart], {
      type: 'audio/mpeg',
    });

    return new Response(audioBlob, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-TTS-Provider': 'cartesia-sonic',
        'X-Voice-Id': activePreset,
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
