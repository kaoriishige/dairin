import type { CustomerPreferences, Vehicle } from '../../types';

export interface VehicleSearchResult {
  exactMatches: Vehicle[];
  nearMatches: Vehicle[];
}

export function parseBudgetYenFromText(text: string): number | null {
  const normalized = text
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/．/g, '.')
    .replace(/，/g, ',')
    .replace(/\d{1,3}(?:,\d{3})+/g, (m) => m.replace(/,/g, ''));

  const manMatch = normalized.match(/(\d+(?:\.\d+)?)\s*万\s*円?/);
  if (manMatch) {
    return Math.round(parseFloat(manMatch[1]) * 10000);
  }
  const yenMatch = normalized.match(/(\d{5,9})\s*円/);
  if (yenMatch) {
    return parseInt(yenMatch[1], 10);
  }
  return null;
}

export function searchVehicles(
  vehicles: Vehicle[],
  prefs: Partial<CustomerPreferences>,
  queryText = ''
): VehicleSearchResult {
  const normalizedQuery = queryText.toLowerCase();
  const budgetMax = prefs.budgetMaxYen ?? parseBudgetYenFromText(queryText);

  const wantsKei =
    prefs.preferredCarType === '軽自動車' ||
    normalizedQuery.includes('軽') ||
    normalizedQuery.includes('軽自動車');
  const wantsSlideDoor =
    normalizedQuery.includes('スライドドア') ||
    normalizedQuery.includes('子ども') ||
    normalizedQuery.includes('子供') ||
    normalizedQuery.includes('家族') ||
    (prefs.requiredFeatures || []).some((f) => f.includes('スライド'));

  const scored = vehicles.map((v) => {
    let score = 0;
    let disqualified = false;

    if (budgetMax && v.basePriceYen) {
      if (v.basePriceYen <= budgetMax) {
        score += 4;
      } else {
        disqualified = true;
      }
    }

    if (wantsKei) {
      if (v.category === '軽自動車') score += 3;
      else disqualified = true;
    }

    if (prefs.preferredMaker && v.maker.includes(prefs.preferredMaker)) {
      score += 3;
    }

    if (wantsSlideDoor) {
      const hasSlide =
        (v.bodyType || '').includes('スライドドア') ||
        v.features.some((f) => f.includes('スライドドア'));
      if (hasSlide) score += 4;
    }

    // テキストキーワード一致
    const searchable = `${v.maker} ${v.modelName} ${v.grade || ''} ${v.bodyType || ''} ${v.features.join(' ')}`.toLowerCase();
    for (const kw of ['ラパン', 'スペーシア', 'ワゴンr', 'ワゴンアール', 'キャンバス', 'ヤリスクロス', 'suv', 'ハイブリッド', 'hv']) {
      if (normalizedQuery.includes(kw) && searchable.includes(kw.replace('ワゴンアール', 'ワゴンr'))) {
        score += 5;
      }
    }

    return { vehicle: v, score, disqualified };
  });

  const exactMatches = scored
    .filter((x) => !x.disqualified && x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.vehicle);

  const nearMatches =
    budgetMax && exactMatches.length > 0
      ? []
      : scored
          .filter((x) => !exactMatches.includes(x.vehicle) && (!budgetMax || !x.disqualified || exactMatches.length === 0))
          .filter((x) => !wantsKei || x.vehicle.category === '軽自動車')
          .sort((a, b) => (a.vehicle.basePriceYen ?? 99999999) - (b.vehicle.basePriceYen ?? 99999999))
          .slice(0, 2)
          .map((x) => x.vehicle);

  return { exactMatches, nearMatches };
}
