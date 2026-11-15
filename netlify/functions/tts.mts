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
  | 'wavenet-a-bright-1'
  | 'wavenet-a-bright-2'
  | 'neural2-b-bright'
  | 'standard-a-bright';

interface VoicePresetConfig {
  googleVoiceName: string;
  speakingRate: number;
  pitch: number;
}

const VOICE_PRESETS: Record<GoogleCuteVoicePreset, VoicePresetConfig> = {
  // ① 若く明るい高音（Wavenet-A ピッチ+6.0・スピード1.18：初期設定）
  'wavenet-a-bright-1': {
    googleVoiceName: 'ja-JP-Wavenet-A',
    speakingRate: 1.18,
    pitch: 6.0,
  },
  // ② さらに若く高め・アニメ調（Wavenet-A ピッチ+8.0・スピード1.20）
  'wavenet-a-bright-2': {
    googleVoiceName: 'ja-JP-Wavenet-A',
    speakingRate: 1.2,
    pitch: 8.0,
  },
  // ③ 若く明るい・受付スタッフ調（Neural2-B ピッチ+6.5・スピード1.18）
  'neural2-b-bright': {
    googleVoiceName: 'ja-JP-Neural2-B',
    speakingRate: 1.18,
    pitch: 6.5,
  },
  // ④ クリアで高い・可愛い声（Standard-A ピッチ+7.0・スピード1.18）
  'standard-a-bright': {
    googleVoiceName: 'ja-JP-Standard-A',
    speakingRate: 1.18,
    pitch: 7.0,
  },
};

async function synthesizeGoogleCloudJapaneseFemale(
  apiKey: string,
  presetKey: GoogleCuteVoicePreset,
  text: string
): Promise<{ ok: boolean; status: number; audioBuffer?: Uint8Array; errorDetail?: string }> {
  const endpoint = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(
    apiKey
  )}`;

  const preset = VOICE_PRESETS[presetKey] ?? VOICE_PRESETS['wavenet-a-bright-1'];

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
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: preset.speakingRate,
        pitch: preset.pitch,
        // 低音のこもりを除去して明るく若い声質にするEQプロファイル
        effectsProfileId: ['small-bluetooth-speaker-class-device'],
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
  return {
    ok: true,
    status: 200,
    audioBuffer: new Uint8Array(binary),
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
      : 'wavenet-a-bright-1';

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
