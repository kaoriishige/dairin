import type { CustomerPreferences, SalesPhase, Vehicle } from '../../types';
import { parseBudgetYenFromText } from '../vehicles/vehicleSearch';

export type ConversationActionType =
  | 'ANSWER_TROUBLE_OR_REPAIR'
  | 'ANSWER_DECLINE_OR_CONTACT'
  | 'ASK_CONDITION'
  | 'PROPOSE_VEHICLES'
  | 'NO_VEHICLE_MATCH'
  | 'ANSWER_SERVICE_OR_FAQ';

export interface ConversationPlan {
  actionType: ConversationActionType;
  nextSalesPhase: SalesPhase;
  nextActiveVehicleId: string | null;
  instructionForLlm: string;
  preselectedVehicleIds: string[];
  allowVehicleRecommendation: boolean;
  extractedPreferences: CustomerPreferences;
}

const TROUBLE_OR_REPAIR_REGEX =
  /異音|故障|不具合|壊れ|動か|クレーム|無償|保証|修理|擦っ|ぶつけ|キズ|傷|へこみ|ヘコミ|鈑金|板金|事故/;

const UNLISTED_VEHICLE_DETAIL_REGEX =
  /支払総額|総支払額|乗り出し|諸費用|修復歴|事故歴|値引き|在庫|残って|売約|納期|ローン金利|審査/;

const SERVICE_OR_FAQ_REGEX =
  /車検|点検|オイル|タイヤ|買取|査定|リース|レンタカー|コーティング|保険|支払い|支払方法|クレジット|VISA|Master|現金|営業時間|定休日|住所|場所|どこ|予約|電話|アクセス|拠点|店舗/;

const PURCHASE_INTENT_REGEX =
  /中古車|新車|車を探|車を買|購入|予算|軽自動車|普通車|スライドドア|ファミリー|おすすめ/;

export function extractPreferencesFromMessage(
  userMessage: string,
  basePrefs: CustomerPreferences
): CustomerPreferences {
  const parsedBudget = parseBudgetYenFromText(userMessage);
  let preferredCarType = basePrefs.preferredCarType;
  if (/軽自動車|軽\b|けい/.test(userMessage)) {
    preferredCarType = '軽自動車';
  } else if (/普通車|SUV|コンパクトカー|ヤリスクロス/i.test(userMessage)) {
    preferredCarType = '普通車';
  }

  const requiredFeatures = new Set(basePrefs.requiredFeatures ?? []);
  if (/スライドドア/.test(userMessage)) requiredFeatures.add('スライドドア');
  if (/ハイブリッド|HV/i.test(userMessage)) requiredFeatures.add('ハイブリッド');
  if (/4WD|四駆/i.test(userMessage)) requiredFeatures.add('4WD');

  return {
    ...basePrefs,
    budgetMaxYen: parsedBudget ?? basePrefs.budgetMaxYen ?? null,
    preferredCarType,
    requiredFeatures: Array.from(requiredFeatures),
  };
}

/**
 * 「頭（判断）」担当：会話文脈と公式データから、今回のターンでAIが取るべき行動と
 * 提示してよい車両・事実をプログラム側で先に1つ確定する。
 */
export function buildConversationPlan(params: {
  userMessage: string;
  prefs: CustomerPreferences;
  vehicles: Vehicle[];
  exactMatches: Vehicle[];
  introducedVehicleIds: string[];
}): ConversationPlan {
  const { userMessage, prefs, vehicles, exactMatches, introducedVehicleIds } = params;
  const extractedPreferences = extractPreferencesFromMessage(userMessage, prefs);

  const currentActiveId =
    prefs.activeVehicleId ?? (introducedVehicleIds.length > 0 ? introducedVehicleIds[introducedVehicleIds.length - 1] : null);
  const activeVehicle = currentActiveId ? vehicles.find((v) => v.id === currentActiveId) ?? null : null;

  // 1. トラブル・クレーム・修理見積り（最優先で安全案内）
  if (TROUBLE_OR_REPAIR_REGEX.test(userMessage)) {
    return {
      actionType: 'ANSWER_TROUBLE_OR_REPAIR',
      nextSalesPhase: 'handoff_store',
      nextActiveVehicleId: currentActiveId,
      instructionForLlm:
        '【行動指示：トラブル・修理の安全案内】お客様のご状況（お名前・車種・症状や損傷箇所）を丁寧に伺いつつ、AIでの金額推測・原因断定・無償修理約束は一切行わず、オートギャラリーダイリン（0287-36-6011）または鈑金専門のカーコンビニ倶楽部 ダイリン（0287-39-5911）へ直接ご連絡いただくよう案内してください。車両カードは出さないでください（recommendedVehicleIds: []）。',
      preselectedVehicleIds: [],
      allowVehicleRecommendation: false,
      extractedPreferences: { ...extractedPreferences, salesPhase: 'handoff_store', activeVehicleId: currentActiveId },
    };
  }

  // 2. 車両のHP未記載項目（総支払額・修復歴・在庫有無・値引き等）の質問
  const mentionsVehicle = vehicles.some(
    (v) => userMessage.includes(v.modelName) || userMessage.includes(v.maker)
  );
  if (UNLISTED_VEHICLE_DETAIL_REGEX.test(userMessage) && (mentionsVehicle || Boolean(activeVehicle) || introducedVehicleIds.length > 0)) {
    const targetName = activeVehicle ? `${activeVehicle.maker} ${activeVehicle.modelName}` : '該当のお車';
    return {
      actionType: 'ANSWER_DECLINE_OR_CONTACT',
      nextSalesPhase: 'handoff_store',
      nextActiveVehicleId: currentActiveId,
      instructionForLlm:
        `【行動指示：HP未記載事項の誠実な店舗案内】現在話題の車両（${targetName}）についてお客様が聞いている項目（総支払額・修復歴・現在庫・値引き・詳細装備など）は公式HPに記載がないため、推測せず「ホームページ上に記載がないため正確にお伝えできない」ことを丁寧にお伝えし、オートギャラリーダイリン（0287-36-6011／公式LINE／WEBフォーム）への直接確認を案内してください。recommendedVehicleIds は必ず [] にし、「下記の〇〇をご覧ください」も書かないでください。`,
      preselectedVehicleIds: [],
      allowVehicleRecommendation: false,
      extractedPreferences: { ...extractedPreferences, salesPhase: 'handoff_store', activeVehicleId: currentActiveId },
    };
  }

  // 3. 紹介済み車両に対する詳細質問（「それの年式は？」「距離は？」「価格は？」など代名詞・省略質問含む）
  const isVehicleDetailQuestion =
    Boolean(activeVehicle) &&
    /その車|これ|それ|年式|走行距離|距離|何キロ|価格|いくら|グレード|特徴|ハイブリッド|色|装備/.test(userMessage) &&
    !/車検|オイル|タイヤ|レンタカー|コーティング|買取|査定/.test(userMessage);

  if (isVehicleDetailQuestion && activeVehicle) {
    return {
      actionType: 'ANSWER_SERVICE_OR_FAQ',
      nextSalesPhase: 'vehicle_qa',
      nextActiveVehicleId: activeVehicle.id,
      instructionForLlm:
        `【行動指示：話題中車両への詳細回答】お客様は現在話題の車両「${activeVehicle.maker} ${activeVehicle.modelName}（年式: ${activeVehicle.year ?? '不明'}年 / 走行距離: ${activeVehicle.mileage ?? '不明'} / 本体価格: ${activeVehicle.basePriceText} / 特徴: ${activeVehicle.features.join('・')}）」について質問しています。この公式情報のみを使って自然に回答し、HPにない詳細（支払総額や修復歴など）が絡む場合は店舗（0287-36-6011）へ案内してください。すでにカードは表示済みのため recommendedVehicleIds は [] とし、「下記の〇〇をご覧ください」は繰り返さないでください。`,
      preselectedVehicleIds: [],
      allowVehicleRecommendation: false,
      extractedPreferences: { ...extractedPreferences, salesPhase: 'vehicle_qa', activeVehicleId: activeVehicle.id },
    };
  }

  // 4. 車検・オイル・タイヤ・買取・リース・FAQ（支払い方法・店舗・予約等）
  if (SERVICE_OR_FAQ_REGEX.test(userMessage) && !PURCHASE_INTENT_REGEX.test(userMessage)) {
    const isInitialInspectionConsult =
      /車検|点検/.test(userMessage) &&
      !/軽自動車|普通車|自動二輪|バイク|1t|1\.5t|2t|いくら|料金|費用|価格|予約/.test(userMessage) &&
      !mentionsVehicle;

    if (isInitialInspectionConsult) {
      return {
        actionType: 'ANSWER_SERVICE_OR_FAQ',
        nextSalesPhase: 'service_qa',
        nextActiveVehicleId: null,
        instructionForLlm:
          '【行動指示：車検・点検の初回ヒアリング（中立確認）】お客様は車検・点検のご相談を始めた段階です。「お乗りのお車は軽自動車でしょうか？」のように特定の車種を絶対に決め打ち・断定せず、「かしこまりました！お乗りのお車の種類（軽自動車・普通車・二輪など）や、車検の時期はお決まりでしょうか？」のように中立的に伺ってください。recommendedVehicleIds は [] にしてください。',
        preselectedVehicleIds: [],
        allowVehicleRecommendation: false,
        extractedPreferences: { ...extractedPreferences, salesPhase: 'service_qa', activeVehicleId: null },
      };
    }

    return {
      actionType: 'ANSWER_SERVICE_OR_FAQ',
      nextSalesPhase: 'service_qa',
      nextActiveVehicleId: currentActiveId,
      instructionForLlm:
        '【行動指示：公式サービス・FAQの正確な案内】下記の公式会社情報・サービス情報・営業知識に記載されている事実のみを使って、人間らしく親切に回答してください。お客様が言っていない車種を勝手に決め打ちしないでください。細かい金額の確定見積りや予約確定は店舗（0287-36-6011、車検センター 0287-39-5611、鈑金 0287-39-5911、買取アップル 0287-38-0544）へ案内してください。recommendedVehicleIds は [] にしてください。',
      preselectedVehicleIds: [],
      allowVehicleRecommendation: false,
      extractedPreferences: { ...extractedPreferences, salesPhase: 'service_qa', activeVehicleId: currentActiveId },
    };
  }

  // 5. 購入相談：条件が1つも揃っていない場合はヒアリング優先
  const hasAnyCondition =
    Boolean(extractedPreferences.budgetMaxYen) ||
    Boolean(extractedPreferences.preferredCarType) ||
    Boolean(extractedPreferences.preferredMaker) ||
    Boolean(extractedPreferences.usagePurpose) ||
    Boolean(extractedPreferences.passengerCount) ||
    (extractedPreferences.requiredFeatures?.length ?? 0) > 0 ||
    mentionsVehicle;

  if (!hasAnyCondition) {
    return {
      actionType: 'ASK_CONDITION',
      nextSalesPhase: 'hearing_condition',
      nextActiveVehicleId: currentActiveId,
      instructionForLlm:
        '【行動指示：希望条件のヒアリング】まだ具体的な購入条件（予算・軽自動車/普通車・用途・希望車種）が確認できていません。車両カードは出さず（recommendedVehicleIds: []）、明るく丁寧に「ご予算や、軽自動車・普通車などのご希望はございますか？」のように希望条件を1つだけ伺ってください。',
      preselectedVehicleIds: [],
      allowVehicleRecommendation: false,
      extractedPreferences: { ...extractedPreferences, salesPhase: 'hearing_condition', activeVehicleId: currentActiveId },
    };
  }

  // 6. 条件に一致する未紹介車両がある場合
  const introducedSet = new Set(introducedVehicleIds);
  const unintroducedMatches = exactMatches.filter((v) => !introducedSet.has(v.id));
  if (unintroducedMatches.length > 0) {
    const picked = unintroducedMatches.slice(0, 2);
    const nextActive = picked[0].id;
    return {
      actionType: 'PROPOSE_VEHICLES',
      nextSalesPhase: 'vehicle_proposed',
      nextActiveVehicleId: nextActive,
      instructionForLlm: `【行動指示：条件一致車両のご提案】プログラムが条件に厳密一致する車両として ${picked
        .map((v) => `${v.maker} ${v.modelName}（id: ${v.id}）`)
        .join('、')} を選定しました。この車両の公式情報（年式・走行距離・本体価格・特徴）を自然な話し言葉で紹介し、最後に「下記の〇〇をご覧ください。」と案内してください。recommendedVehicleIds には選定されたIDのみを入れてください。`,
      preselectedVehicleIds: picked.map((v) => v.id),
      allowVehicleRecommendation: true,
      extractedPreferences: { ...extractedPreferences, salesPhase: 'vehicle_proposed', activeVehicleId: nextActive },
    };
  }

  // 7. すでに紹介済み車両に関する通常質問
  if (introducedVehicleIds.length > 0 && exactMatches.length > 0) {
    return {
      actionType: 'ANSWER_SERVICE_OR_FAQ',
      nextSalesPhase: 'vehicle_qa',
      nextActiveVehicleId: currentActiveId ?? exactMatches[0].id,
      instructionForLlm:
        '【行動指示：紹介済み車両への追加回答】すでに紹介済みの車両について公式HP記載の事実のみで回答し、HPにない事項は店舗（0287-36-6011）へ案内してください。カードはすでに表示済みのため recommendedVehicleIds は [] とし、「下記の〇〇をご覧ください」は繰り返さないでください。',
      preselectedVehicleIds: [],
      allowVehicleRecommendation: false,
      extractedPreferences: {
        ...extractedPreferences,
        salesPhase: 'vehicle_qa',
        activeVehicleId: currentActiveId ?? exactMatches[0].id,
      },
    };
  }

  // 8. 条件に一致する掲載車両が0件の場合
  return {
    actionType: 'NO_VEHICLE_MATCH',
    nextSalesPhase: 'handoff_store',
    nextActiveVehicleId: currentActiveId,
    instructionForLlm:
      '【行動指示：該当車両なしの誠実な案内】ご指定の条件（予算・車種等）に合う公式HP掲載車両は現在0件です。予算オーバーや別区分の車両を無理におすすめせず、HP掲載外在庫や最新入庫がある可能性を添えてオートギャラリーダイリン（0287-36-6011／公式LINE／WEBフォーム）へのお問い合わせを案内してください。recommendedVehicleIds は必ず [] にしてください。',
    preselectedVehicleIds: [],
    allowVehicleRecommendation: false,
    extractedPreferences: { ...extractedPreferences, salesPhase: 'handoff_store', activeVehicleId: currentActiveId },
  };
}
