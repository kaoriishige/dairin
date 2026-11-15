import type { Config, Context } from '@netlify/functions';
import {
  checkRateLimit,
  getClientIp,
  getEnv,
  jsonResponse,
  sanitizeUserInput,
  verifyDemoAccess,
} from './_shared/security';

// 第3章 確定Voice ID（第1優先）
const PRIMARY_VOICE_ID = 'dp4HJlekKt0HZFHL2jQg';
// ElevenLabs無料プランでLibrary Voice制限（402 paid_plan_required）が発生した際の同API内バックアップ女性ボイス
const FREE_PLAN_FALLBACK_VOICE_ID = 'cgSgspJ2msm6clMCkdW9';

async function requestElevenLabsStream(
  apiKey: string,
  voiceId: string,
  text: string,
  modelId: string
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
      model_id: modelId,
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.78,
        style: 0.08,
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

  const ttsEnabled = getEnv('ENABLE_ELEVENLABS_TTS', 'true').toLowerCase() !== 'false';
  if (!ttsEnabled) {
    return jsonResponse(
      {
        error: '現在、公開モード設定により音声再生は無効化されています（文字チャットをご利用いただけます）。',
        code: 'TTS_DISABLED',
      },
      503
    );
  }

  const apiKey = getEnv('ELEVENLABS_API_KEY', '').trim();
  if (!apiKey || apiKey === 'your_elevenlabs_api_key_here') {
    return jsonResponse(
      {
        error:
          'ElevenLabs APIキー（ELEVENLABS_API_KEY）が未設定のため、文字チャットのみで動作しています。',
        code: 'ELEVENLABS_NOT_CONFIGURED',
      },
      503
    );
  }

  const modelId = getEnv('ELEVENLABS_MODEL_ID', 'eleven_multilingual_v2').trim();
  const maxChars = Math.min(400, Math.max(80, Number(getEnv('MAX_TTS_CHARS_PER_TURN', '240')) || 240));

  let body: { text?: string; modelId?: string };
  try {
    body = (await req.json()) as { text?: string; modelId?: string };
  } catch {
    return jsonResponse({ error: 'リクエスト形式が不正です。' }, 400);
  }

  const text = sanitizeUserInput(body.text || '', maxChars);
  if (!text) {
    return jsonResponse({ error: '読み上げテキストが空です。' }, 400);
  }

  const selectedModel =
    body.modelId && ['eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_v4_turbo'].includes(body.modelId)
      ? body.modelId
      : modelId;

  try {
    // 1. まず指定Voice ID (dp4HJlekKt0HZFHL2jQg) でリクエスト
    let upstream = await requestElevenLabsStream(apiKey, PRIMARY_VOICE_ID, text, selectedModel);
    let activeVoiceId = PRIMARY_VOICE_ID;
    let usedFallback = false;

    // 2. 無料プラン制限 (402 paid_plan_required) の場合は同ElevenLabs内の無料対応女性ボイスで生成
    if (upstream.status === 402) {
      const errBody = await upstream.text().catch(() => '');
      if (errBody.includes('paid_plan_required')) {
        upstream = await requestElevenLabsStream(
          apiKey,
          FREE_PLAN_FALLBACK_VOICE_ID,
          text,
          selectedModel
        );
        activeVoiceId = FREE_PLAN_FALLBACK_VOICE_ID;
        usedFallback = true;
      }
    }

    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => '');
      const isQuota =
        upstream.status === 401 ||
        upstream.status === 402 ||
        upstream.status === 429 ||
        errBody.toLowerCase().includes('quota');

      return jsonResponse(
        {
          error: isQuota
            ? 'ElevenLabsの無料利用枠または認証上限に達したため、文字チャットに切り替えます。'
            : `ElevenLabs音声生成エラー (${upstream.status})`,
          code: isQuota ? 'QUOTA_OR_AUTH_ERROR' : 'ELEVENLABS_UPSTREAM_ERROR',
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
        'X-Voice-Id': activeVoiceId,
        'X-Voice-Fallback': usedFallback ? 'true' : 'false',
        'X-Model-Id': selectedModel,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse(
      {
        error: 'ElevenLabsへの接続中に通信エラーが発生しました。',
        detail: message,
      },
      502
    );
  }
};

export const config: Config = {
  path: '/api/tts',
};
