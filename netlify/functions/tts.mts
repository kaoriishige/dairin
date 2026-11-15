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

export type CuteFemaleVoicePreset =
  | 'voicevox-tsumugi'
  | 'voicevox-metan'
  | 'cartesia-suzuka-bright'
  | 'cartesia-rin-bright';

async function synthesizeVoicevoxCuteGirl(
  speakerId: number,
  text: string
): Promise<{ ok: boolean; audioBuffer?: Uint8Array; errorDetail?: string }> {
  try {
    const initUrl = `https://api.tts.quest/v3/voicevox/synthesis?speaker=${speakerId}&text=${encodeURIComponent(
      text
    )}`;
    const initRes = await fetch(initUrl, { signal: AbortSignal.timeout(6000) });
    if (!initRes.ok) {
      return { ok: false, errorDetail: `VOICEVOX init HTTP ${initRes.status}` };
    }
    const data = (await initRes.json()) as {
      success?: boolean;
      audioStatusUrl?: string;
      mp3DownloadUrl?: string;
    };
    if (!data.success || !data.audioStatusUrl || !data.mp3DownloadUrl) {
      return { ok: false, errorDetail: 'VOICEVOX init returned unsuccessful payload' };
    }

    for (let i = 0; i < 22; i++) {
      const stRes = await fetch(data.audioStatusUrl, { signal: AbortSignal.timeout(4000) });
      if (stRes.ok) {
        const st = (await stRes.json()) as { isAudioReady?: boolean; isAudioError?: boolean };
        if (st.isAudioError) {
          return { ok: false, errorDetail: 'VOICEVOX synthesis status error' };
        }
        if (st.isAudioReady) {
          const mp3Res = await fetch(data.mp3DownloadUrl, { signal: AbortSignal.timeout(6000) });
          if (mp3Res.ok) {
            const arr = await mp3Res.arrayBuffer();
            if (arr.byteLength > 500) {
              return { ok: true, audioBuffer: new Uint8Array(arr) };
            }
          }
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 280));
    }
    return { ok: false, errorDetail: 'VOICEVOX synthesis timeout' };
  } catch (err) {
    return { ok: false, errorDetail: err instanceof Error ? err.message : 'VOICEVOX error' };
  }
}

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

  const requestedVoice = body.voice as CuteFemaleVoicePreset | undefined;
  const activePreset: CuteFemaleVoicePreset =
    requestedVoice &&
    ['voicevox-tsumugi', 'voicevox-metan', 'cartesia-suzuka-bright', 'cartesia-rin-bright'].includes(
      requestedVoice
    )
      ? requestedVoice
      : 'voicevox-tsumugi';

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

  try {
    // ①・② 日本の若手女性声優による本物の若い女の子ボイス（VOICEVOX）
    if (activePreset === 'voicevox-tsumugi' || activePreset === 'voicevox-metan') {
      const speakerId = activePreset === 'voicevox-tsumugi' ? 8 : 2; // 8: 春日部つむぎ(元気な若い女の子), 2: 四国めたん(明るく可愛い看板娘)
      const vvResult = await synthesizeVoicevoxCuteGirl(speakerId, text);
      if (vvResult.ok && vvResult.audioBuffer) {
        const audioBlob = new Blob([vvResult.audioBuffer as unknown as BlobPart], {
          type: 'audio/mpeg',
        });
        return new Response(audioBlob, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'no-store',
            'X-TTS-Provider': 'voicevox',
            'X-Voice-Id': activePreset,
          },
        });
      }
      // 万が一VOICEVOXが混雑していた場合は即座にCartesiaの明るい若い女性音声でバックアップ再生
    }

    // ③・④ Cartesia Sonic 最新モデル（明るいポジティブ感情最大）
    const cartesiaVoiceId =
      activePreset === 'cartesia-rin-bright' || activePreset === 'voicevox-metan'
        ? '7be83d14-4707-43ad-9774-e24eb38320f0' // Rin (明るく親しみやすい女性)
        : '156fdc17-0578-45d7-b0f4-94ec18d3e07c'; // Suzuka (明るくハキハキした受付女性)

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
