import type { Config } from '@netlify/functions';
import * as cheerio from 'cheerio';
import type { CrawlDiffReport } from '../../src/types';
import { loadAllKnowledgeData } from './_shared/dataLoader';
import { jsonResponse, verifyAdminAuth } from './_shared/security';

const TARGET_URLS = [
  'https://www.jp-dairin.jp/',
  'https://www.jp-dairin.jp/service/car-sales-lease',
  'https://www.jp-dairin.jp/service/inspection',
  'https://www.jp-dairin.jp/service/body-paint',
  'https://www.jp-dairin.jp/service/insurance-others',
  'https://www.jp-dairin.jp/company',
];

export default async (req: Request) => {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) {
    return jsonResponse({ error: auth.reason || 'Unauthorized' }, 401);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  try {
    const existing = await loadAllKnowledgeData();
    const fetchedPages: Array<{ url: string; text: string; ok: boolean; error?: string }> = [];

    for (const url of TARGET_URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'DairinAISalesAdminSync/1.0' },
        });
        if (!res.ok) {
          fetchedPages.push({ url, text: '', ok: false, error: `HTTP ${res.status}` });
          continue;
        }
        const html = await res.text();
        const $ = cheerio.load(html);
        const text = $('body').text().replace(/\s+/g, ' ').trim();
        fetchedPages.push({ url, text, ok: true });
      } catch (err) {
        fetchedPages.push({
          url,
          text: '',
          ok: false,
          error: err instanceof Error ? err.message : 'Fetch error',
        });
      }
    }

    const successPages = fetchedPages.filter((p) => p.ok);
    if (successPages.length === 0) {
      const report: CrawlDiffReport = {
        checkedAt: new Date().toISOString(),
        addedVehicles: [],
        updatedVehicles: [],
        removedVehicles: [],
        changedPrices: [],
        changedServices: [],
        needsConfirmation: existing.discrepancies,
        status: 'failed',
        message: '公式サイトの取得に失敗しました。安全のため既存データは保持されています。',
      };
      return jsonResponse({ report, fetchedPages: fetchedPages.map((p) => ({ url: p.url, ok: p.ok, error: p.error })) });
    }

    const salesPageText =
      fetchedPages.find((p) => p.url.includes('car-sales-lease'))?.text ||
      fetchedPages.find((p) => p.url === 'https://www.jp-dairin.jp/')?.text ||
      '';

    const removedVehicles: string[] = [];
    const updatedVehicles: string[] = [];

    for (const v of existing.vehicles) {
      if (!salesPageText.includes(v.modelName)) {
        removedVehicles.push(`${v.maker} ${v.modelName} (${v.basePriceText || ''})`);
      } else if (v.basePriceText) {
        const priceNum = v.basePriceText.replace(/（本体価格）/, '');
        if (!salesPageText.includes(priceNum)) {
          updatedVehicles.push(`${v.maker} ${v.modelName}: 価格表記変更の可能性 (${priceNum})`);
        }
      }
    }

    const report: CrawlDiffReport = {
      checkedAt: new Date().toISOString(),
      addedVehicles: [],
      updatedVehicles,
      removedVehicles,
      changedPrices: updatedVehicles,
      changedServices: [],
      needsConfirmation: existing.discrepancies,
      status: successPages.length === TARGET_URLS.length ? 'success' : 'partial_failure',
      message: `${TARGET_URLS.length}ページ中 ${successPages.length}ページを再取得し、既存データ（車両${existing.vehicles.length}台・サービス${existing.services.length}件）と比較しました。既存データは保護されています。`,
    };

    return jsonResponse({
      report,
      fetchedPages: fetchedPages.map((p) => ({ url: p.url, ok: p.ok, error: p.error })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: '更新チェック中にエラーが発生しました。', detail: message }, 500);
  }
};

export const config: Config = {
  path: '/api/admin-crawl',
};
