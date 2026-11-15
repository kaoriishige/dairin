import type { Config, Context } from '@netlify/functions';
import {
  checkRateLimit,
  getClientIp,
  getEnv,
  jsonResponse,
  sanitizeUserInput,
  verifyDemoAccess,
} from './_shared/security';

// 第3章 確定Voice ID（変更禁止）
const FIXED_VOICE_ID = 'dp4HJlekKt0HZFHL2jQg';

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

  // 商用利用許諾前の外部公開時などに音声機能を安全に無効化できる制御
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

  // 環境変数が設定されていても確定Voice ID以外への変更を防止
  const envVoiceId = getEnv('ELEVENLABS_VOICE_ID', FIXED_VOICE_ID).trim();
  const voiceId = envVoiceId === FIXED_VOICE_ID ? FIXED_VOICE_ID : FIXED_VOICE_ID;
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

  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`;

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: selectedModel,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.78,
          style: 0.08,
          use_speaker_boost: true,
        },
      }),
    });

    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => '');
      const isPaidPlanRequired = errBody.includes('paid_plan_required');
      const isQuota =
        upstream.status === 401 ||
        upstream.status === 402 ||
        upstream.status === 429 ||
        errBody.toLowerCase().includes('quota');

      const friendlyError = isPaidPlanRequired
        ? 'ElevenLabs無料プランの仕様制限（Free users cannot use library voices via the API）により、指定Voice ID（dp4HJlekKt0HZFHL2jQg）のAPI音声生成には有料プランが必要です。文字チャットモードで会話を継続します。'
        : isQuota
        ? 'ElevenLabsの無料利用枠またはAPIキー権限の制限に達したため、文字チャットに切り替えます。'
        : `ElevenLabs音声生成エラー (${upstream.status})`;

      return jsonResponse(
        {
          error: friendlyError,
          code: isPaidPlanRequired
            ? 'PAID_PLAN_REQUIRED_FOR_VOICE'
            : isQuota
            ? 'QUOTA_OR_AUTH_ERROR'
            : 'ELEVENLABS_UPSTREAM_ERROR',
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
        'X-Voice-Id': voiceId,
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
