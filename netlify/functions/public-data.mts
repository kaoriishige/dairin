import type { Config } from '@netlify/functions';
import { loadAllKnowledgeData } from './_shared/dataLoader';
import { getEnv, jsonResponse, verifyDemoAccess } from './_shared/security';

export default async (req: Request) => {
  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  const passcodeRequired = Boolean(getEnv('DEMO_ACCESS_PASSCODE', '').trim());
  const accessGranted = verifyDemoAccess(req);

  if (!accessGranted) {
    return jsonResponse(
      {
        passcodeRequired: true,
        accessGranted: false,
        error: 'デモサイトをご覧いただくにはパスコードの入力が必要です。',
      },
      401
    );
  }

  try {
    const { company, vehicles, services } = await loadAllKnowledgeData();
    const openaiKey = getEnv('OPENAI_API_KEY', '').trim();
    const ttsEnabled =
      Boolean(openaiKey) && openaiKey !== 'your_openai_api_key_here';

    return jsonResponse({
      passcodeRequired,
      accessGranted: true,
      company,
      vehicles,
      services,
      runtime: {
        ttsEnabled,
        voiceId: getEnv('OPENAI_TTS_VOICE', 'coral'),
        modelId: 'gpt-4o-mini-tts',
        maxTtsCallsPerSession: Number(getEnv('MAX_TTS_CALLS_PER_SESSION', '25')) || 25,
        maxSessionDurationMinutes: Number(getEnv('MAX_SESSION_DURATION_MINUTES', '20')) || 20,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: 'データの読み込みに失敗しました。', detail: message }, 500);
  }
};

export const config: Config = {
  path: '/api/public-data',
};
