import crypto from 'node:crypto';
import type { Context } from '@netlify/functions';

// インメモリ・レートリミット（同一インスタンス内での連続リクエスト保護）
const rateLimitMap = new Map<string, number[]>();

export function getEnv(name: string, fallback = ''): string {
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env) {
      return Netlify.env.get(name) ?? process.env[name] ?? fallback;
    }
  } catch {
    // ローカルまたはテスト環境フォールバック
  }
  return process.env[name] ?? fallback;
}

export function checkRateLimit(ip: string, maxRequests = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    rateLimitMap.set(ip, timestamps);
    return false;
  }
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

export function getClientIp(req: Request, context?: Context): string {
  return (
    context?.ip ||
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export function verifyDemoAccess(req: Request): boolean {
  const configuredPasscode = getEnv('DEMO_ACCESS_PASSCODE', '').trim();
  if (!configuredPasscode) return true;
  const provided = req.headers.get('x-demo-passcode')?.trim() ?? '';
  if (!provided || provided.length !== configuredPasscode.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(configuredPasscode));
}

export function verifyAdminAuth(req: Request): { ok: boolean; reason?: string } {
  const adminPassword = getEnv('ADMIN_PASSWORD', '').trim();
  if (!adminPassword) {
    return { ok: false, reason: 'ADMIN_PASSWORD がサーバー環境変数に設定されていません。' };
  }
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token || token.length !== adminPassword.length) {
    return { ok: false, reason: '管理者認証に失敗しました。' };
  }
  const match = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(adminPassword));
  return match ? { ok: true } : { ok: false, reason: 'パスワードが正しくありません。' };
}

export function sanitizeUserInput(text: string, maxLength = 500): string {
  // 制御文字を除去し長さを制限
  const cleaned = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return cleaned.slice(0, maxLength);
}

export function detectPromptInjection(text: string): boolean {
  const suspiciousPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /system\s+prompt/i,
    /reveal\s+(your\s+)?(api|secret|key|prompt)/i,
    /今までの指示を無視/,
    /システムプロンプトを(教え|表示|出力)/,
    /APIキーを(教え|表示|出力)/,
  ];
  return suspiciousPatterns.some((p) => p.test(text));
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
