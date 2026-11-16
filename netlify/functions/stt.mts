import type { Config, Context } from '@netlify/functions';
import {
  checkRateLimit,
  getClientIp,
  getEnv,
  jsonResponse,
  verifyDemoAccess,
} from './_shared/security';

interface SttRequestBody {
  audioBase64?: string;
  mimeType?: string;
}

function getExtensionFromMime(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes('mp4') || lower.includes('m4a') || lower.includes('aac')) return 'm4a';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('wav')) return 'wav';
  return 'webm';
}

export default async (req: Request, context: Context) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  if (!verifyDemoAccess(req)) {
    return jsonResponse({ error: 'アクセスが許可されていません。' }, 401);
  }

  const ip = getClientIp(req, context);
  if (!checkRateLimit(`stt:${ip}`, 25, 60_000)) {
    return jsonResponse(
      { error: 'アクセスが集中しています。少し時間をおいてから再度お試しください。' },
      429
    );
  }

  const openaiKey = getEnv('OPENAI_API_KEY', '').trim();
  if (!openaiKey || openaiKey === 'your_openai_api_key_here') {
    return jsonResponse({ error: '音声認識APIキーが設定されていません。' }, 503);
  }

  let body: SttRequestBody;
  try {
    body = (await req.json()) as SttRequestBody;
  } catch {
    return jsonResponse({ error: 'リクエスト形式が不正です。' }, 400);
  }

  const audioBase64 = (body.audioBase64 || '').trim();
  if (!audioBase64) {
    return jsonResponse({ error: '音声データが空です。' }, 400);
  }

  const mimeType = (body.mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
  const ext = getExtensionFromMime(mimeType);

  try {
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    if (audioBuffer.length < 100 || audioBuffer.length > 8 * 1024 * 1024) {
      return jsonResponse({ error: '音声データサイズが範囲外です。' }, 400);
    }

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([audioBuffer], { type: mimeType }),
      `speech.${ext}`
    );
    formData.append('model', 'whisper-1');
    formData.append('language', 'ja');
    formData.append(
      'prompt',
      'オートギャラリーダイリン、軽自動車、普通車、中古車、車検、鈑金、ワゴンR、アルトラパン、スペーシア、ムーヴキャンバス、ヤリスクロス、100万円'
    );

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return jsonResponse(
        { error: '音声の文字起こしに失敗しました。', detail: detail.slice(0, 200) },
        502
      );
    }

    const data = (await res.json()) as { text?: string };
    return jsonResponse({ text: (data.text || '').trim() });
  } catch (err) {
    return jsonResponse(
      {
        error: '音声認識中にエラーが発生しました。',
        detail: err instanceof Error ? err.message : 'Unknown error',
      },
      500
    );
  }
};

export const config: Config = {
  path: '/api/stt',
};
