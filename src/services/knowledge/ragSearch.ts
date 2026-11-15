import type { KnowledgeEntry, ServiceInfo } from '../../types';

function extractTokens(text: string): string[] {
  const cleaned = text.toLowerCase().replace(/[\s、。！？!?.,/]/g, '');
  const tokens = new Set<string>();
  for (let i = 0; i < cleaned.length - 1; i++) {
    tokens.add(cleaned.slice(i, i + 2));
  }
  return Array.from(tokens);
}

export function searchKnowledgeEntries(
  entries: KnowledgeEntry[],
  query: string,
  limit = 5
): KnowledgeEntry[] {
  const approved = entries.filter((e) => e.approvalStatus === 'approved');
  const qLower = query.toLowerCase();
  const qTokens = extractTokens(query);

  const scored = approved.map((entry) => {
    let score = 0;
    for (const kw of entry.keywords) {
      if (qLower.includes(kw.toLowerCase())) score += 5;
    }
    if (qLower.includes(entry.category.toLowerCase())) score += 4;

    const targetText = `${entry.title} ${entry.content}`.toLowerCase();
    for (const tok of qTokens) {
      if (targetText.includes(tok)) score += 0.4;
    }
    return { entry, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.entry);
}

export function searchServices(
  services: ServiceInfo[],
  query: string,
  limit = 3
): ServiceInfo[] {
  const qLower = query.toLowerCase();
  const scored = services.map((srv) => {
    let score = 0;
    const text = `${srv.category} ${srv.title} ${srv.summary} ${srv.details.join(' ')}`.toLowerCase();
    if (qLower.includes(srv.category.toLowerCase())) score += 5;
    for (const kw of ['車検', '点検', 'オイル', 'タイヤ', '買取', '買い取', '査定', '下取り', '売却', 'リース', '月々', '鈑金', '板金', 'キズ', '修理', '保険', 'レンタカー', 'コーティング', '新車', '中古車']) {
      if (qLower.includes(kw)) {
        const normalizedKw = kw === '買い取' || kw === '売却' ? '買取' : kw;
        if (text.includes(normalizedKw)) score += 4;
      }
    }
    return { srv, score };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.srv);
}
