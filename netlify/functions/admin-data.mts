import type { Config } from '@netlify/functions';
import type { SystemHealthStatus } from '../../src/types';
import { loadAllKnowledgeData } from './_shared/dataLoader';
import { getEnv, jsonResponse, verifyAdminAuth } from './_shared/security';

const FIXED_VOICE_ID = 'dp4HJlekKt0HZFHL2jQg';

async function checkElevenLabsStatus(apiKey: string, modelId: string): Promise<Partial<SystemHealthStatus>> {
  if (!apiKey || apiKey === 'your_elevenlabs_api_key_here') {
    return {
      elevenlabsConfigured: false,
      voiceConnectionStatus: 'unverified',
    };
  }

  try {
    const [voiceRes, subRes] = await Promise.all([
      fetch(`https://api.elevenlabs.io/v1/voices/${FIXED_VOICE_ID}`, {
        headers: { 'xi-api-key': apiKey },
      }),
      fetch('https://api.elevenlabs.io/v1/user/subscription', {
        headers: { 'xi-api-key': apiKey },
      }),
    ]);

    let voiceName: string | undefined;
    let status: SystemHealthStatus['voiceConnectionStatus'] = 'error';

    if (voiceRes.ok) {
      const vData = (await voiceRes.json()) as { name?: string };
      voiceName = vData.name;
      status = 'connected';
    } else if (voiceRes.status === 401 || voiceRes.status === 402 || voiceRes.status === 429) {
      status = 'quota_exceeded';
    }

    let characterCountUsed: number | undefined;
    let characterLimit: number | undefined;
    if (subRes.ok) {
      const sData = (await subRes.json()) as {
        character_count?: number;
        character_limit?: number;
      };
      characterCountUsed = sData.character_count;
      characterLimit = sData.character_limit;
    }

    return {
      elevenlabsConfigured: true,
      elevenlabsModelId: modelId,
      voiceConnectionStatus: status,
      voiceName,
      characterCountUsed,
      characterLimit,
    };
  } catch {
    return {
      elevenlabsConfigured: true,
      voiceConnectionStatus: 'error',
    };
  }
}

export default async (req: Request) => {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) {
    return jsonResponse({ error: auth.reason || 'Unauthorized' }, 401);
  }

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  try {
    const data = await loadAllKnowledgeData();
    const openaiKey = getEnv('OPENAI_API_KEY', '').trim();
    const elevenKey = getEnv('ELEVENLABS_API_KEY', '').trim();
    const openaiModel = getEnv('OPENAI_MODEL', 'gpt-4o-mini');
    const elevenModel = getEnv('ELEVENLABS_MODEL_ID', 'eleven_multilingual_v2');
    const ttsEnabled = getEnv('ENABLE_ELEVENLABS_TTS', 'true').toLowerCase() !== 'false';

    const elStatus = await checkElevenLabsStatus(elevenKey, elevenModel);

    const health: SystemHealthStatus = {
      openaiConfigured: Boolean(openaiKey && openaiKey !== 'your_openai_api_key_here'),
      openaiModel,
      elevenlabsConfigured: Boolean(elStatus.elevenlabsConfigured),
      elevenlabsVoiceId: FIXED_VOICE_ID,
      elevenlabsModelId: elevenModel,
      ttsEnabled,
      voiceConnectionStatus: elStatus.voiceConnectionStatus ?? 'unverified',
      voiceName: elStatus.voiceName,
      characterCountUsed: elStatus.characterCountUsed,
      characterLimit: elStatus.characterLimit,
    };

    return jsonResponse({
      ...data,
      health,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: '管理データの取得に失敗しました。', detail: message }, 500);
  }
};

export const config: Config = {
  path: '/api/admin-data',
};
