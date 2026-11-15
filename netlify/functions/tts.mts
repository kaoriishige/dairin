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

export type GoogleCuteVoicePreset =
  | 'ja-JP-Chirp3-HD-Leda'
  | 'ja-JP-Chirp3-HD-Zephyr'
  | 'ja-JP-Wavenet-A-cute'
  | 'ja-JP-Neural2-B-cute';

interface VoicePresetConfig {
  googleVoiceName: string;
  speakingRate?: number;
  pitch?: number;
}

const VOICE_PRESETS: Record<GoogleCuteVoicePreset, VoicePresetConfig> = {
  // Chirp3-HD Leda: 若々しく可愛い女性ボイス（初期設定）
  'ja-JP-Chirp3-HD-Leda': {
    googleVoiceName: 'ja-JP-Chirp3-HD-Leda',
  },
  // Chirp3-HD Zephyr: 明るく元気で可愛い女性ボイス
  'ja-JP-Chirp3-HD-Zephyr': {
    googleVoiceName: 'ja-JP-Chirp3-HD-Zephyr',
  },
  // Wavenet-A (ピッチ+3.2): 高めで可愛いアニメ・キャラクター調
  'ja-JP-Wavenet-A-cute': {
    googleVoiceName: 'ja-JP-Wavenet-A',
    speakingRate: 1.08,
    pitch: 3.2,
  },
  // Neural2-B (ピッチ+3.2): 高めで可愛い受付スタッフ調
  'ja-JP-Neural2-B-cute': {
    googleVoiceName: 'ja-JP-Neural2-B',
    speakingRate: 1.08,
    pitch: 3.2,
  },
};

async function synthesizeGoogleCloudJapaneseFemale(
  apiKey: string,
  presetKey: GoogleCuteVoicePreset,
  text: string
): Promise<{ ok: boolean; status: number; audioBuffer?: Uint8Array; errorDetail?: string; usedVoice?: string }> {
  const endpoint = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(
    apiKey
  )}`;

  const preset = VOICE_PRESETS[presetKey] ?? VOICE_PRESETS['ja-JP-Chirp3-HD-Leda'];
  const audioConfig: Record<string, unknown> = {
    audioEncoding: 'MP3',
  };
  if (typeof preset.speakingRate === 'number') {
    audioConfig.speakingRate = preset.speakingRate;
  }
  if (typeof preset.pitch === 'number') {
    audioConfig.pitch = preset.pitch;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode: 'ja-JP',
        name: preset.googleVoiceName,
      },
      audioConfig,
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
  return {
    ok: true,
    status: 200,
    audioBuffer: new Uint8Array(binary),
    usedVoice: preset.googleVoiceName,
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

  let body: { text?: string; voice?: string };
  try {
    body = (await req.json()) as { text?: string; voice?: string };
  } catch {
    return jsonResponse({ error: 'リクエスト形式が不正です。' }, 400);
  }

  const rawText = sanitizeUserInput(body.text || '', maxChars);
  const text = normalizeTextForGoogleCloudTts(rawText);
  if (!text) {
    return jsonResponse({ error: '読み上げテキストが空です。' }, 400);
  }

  const requestedVoice = body.voice as GoogleCuteVoicePreset | undefined;
  const activePreset: GoogleCuteVoicePreset =
    requestedVoice && requestedVoice in VOICE_PRESETS
      ? requestedVoice
      : 'ja-JP-Chirp3-HD-Leda';

  try {
    const result = await synthesizeGoogleCloudJapaneseFemale(googleKey, activePreset, text);
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
