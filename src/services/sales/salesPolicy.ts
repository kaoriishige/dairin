import type { CustomerPreferences, SalesPurpose, Vehicle } from '../../types';

export interface ParsedChatOutput {
  replyDisplayText?: string;
  replySpeechText?: string;
  recommendedVehicleIds?: string[];
  salesPurpose?: SalesPurpose;
  updatedPreferences?: Partial<CustomerPreferences>;
}

export interface SalesPolicyInput {
  userMessage: string;
  vehicles: Vehicle[];
  mergedPrefs: CustomerPreferences;
  parsed: ParsedChatOutput;
  exactMatches: Vehicle[];
}

export interface SalesPolicyResult {
  displayText: string;
  rawSpeechText: string;
  recommendedVehicleIds: string[];
  effectiveBudgetMax: number | null;
}

const NO_MATCH_GUIDANCE_DISPLAY =
  'ご希望の条件にぴったり合うホームページ掲載車両が現在見つかりませんでした。非掲載の在庫や最新の入庫車両をご案内できる場合もございますので、お手数ですがオートギャラリーダイリン（電話：0287-36-6011、または公式LINE・WEBお問い合わせフォーム）まで直接お問い合わせください。';

const NO_MATCH_GUIDANCE_SPEECH =
  'ご希望の条件にぴったり合うホームページ掲載車両が現在見つかりませんでした。非掲載の在庫や最新の入庫車両をご案内できる場合もございますので、お手数ですがオートギャラリー・ダイリン、お電話 0287-36-6011、または公式LINE、WEBお問い合わせフォームまで直接お問い合わせください。';

/**
 * 営業システムの確定ルールをプログラム側で強制適用する。
 * - 初回（条件未確認）での車両カード提示禁止
 * - 予算上限・車種区分を超える車両の強制除外
 * - 該当0件時の「少々お待ちください」等の曖昧返答・非対象車両言及の抑止と店舗案内
 * - 車両カード提示時の誘導文言（「下記の〇〇をご覧ください。」）の保証
 */
export function enforceSalesPolicy(input: SalesPolicyInput): SalesPolicyResult {
  const { userMessage, vehicles, mergedPrefs, parsed, exactMatches } = input;

  const effectiveBudgetMax =
    mergedPrefs.budgetMaxYen ?? parsed.updatedPreferences?.budgetMaxYen ?? null;
  const effectiveCarType =
    mergedPrefs.preferredCarType ?? parsed.updatedPreferences?.preferredCarType ?? null;

  const hasAnyCondition =
    Boolean(effectiveBudgetMax) ||
    Boolean(effectiveCarType) ||
    Boolean(mergedPrefs.preferredMaker) ||
    Boolean(mergedPrefs.usagePurpose) ||
    Boolean(mergedPrefs.passengerCount) ||
    (mergedPrefs.requiredFeatures?.length ?? 0) > 0 ||
    Boolean(parsed.updatedPreferences?.preferredMaker) ||
    Boolean(parsed.updatedPreferences?.usagePurpose) ||
    Boolean(parsed.updatedPreferences?.passengerCount) ||
    (parsed.updatedPreferences?.requiredFeatures?.length ?? 0) > 0 ||
    vehicles.some((v) => userMessage.includes(v.modelName) || userMessage.includes(v.maker));

  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
  const rawIds = parsed.recommendedVehicleIds ?? [];

  let recommendedVehicleIds: string[] = [];
  if (hasAnyCondition) {
    recommendedVehicleIds = rawIds
      .filter((id) => {
        const v = vehicleMap.get(id);
        if (!v) return false;
        if (effectiveBudgetMax && v.basePriceYen && v.basePriceYen > effectiveBudgetMax) {
          return false;
        }
        if (effectiveCarType === '軽自動車' && v.category !== '軽自動車') {
          return false;
        }
        if (effectiveCarType === '普通車' && v.category !== '普通車') {
          return false;
        }
        return true;
      })
      .slice(0, 3);

    // AIが予算オーバー車等を選んで全滅したが、厳密一致する車両がある場合は差し替える
    if (rawIds.length > 0 && recommendedVehicleIds.length === 0 && exactMatches.length > 0) {
      recommendedVehicleIds = exactMatches.slice(0, 2).map((v) => v.id);
    }
  }

  let displayText =
    parsed.replyDisplayText?.trim() ||
    'お問い合わせありがとうございます。詳しくお伺いできますでしょうか。';
  let rawSpeechText = parsed.replySpeechText?.trim() || displayText;

  const isPurchaseContext =
    !parsed.salesPurpose ||
    parsed.salesPurpose === 'used_car' ||
    parsed.salesPurpose === 'budget_search' ||
    parsed.salesPurpose === 'unknown';

  if (hasAnyCondition && isPurchaseContext && recommendedVehicleIds.length === 0 && exactMatches.length === 0) {
    const mentionsAnyVehicle = vehicles.some((v) => displayText.includes(v.modelName));
    const isStallingReply =
      /お待ちください|お調べします|確認します/.test(displayText) &&
      !displayText.includes('0287-36-6011') &&
      !displayText.includes('見つかりません');

    if (mentionsAnyVehicle || isStallingReply) {
      displayText = NO_MATCH_GUIDANCE_DISPLAY;
      rawSpeechText = NO_MATCH_GUIDANCE_SPEECH;
    }
  }

  if (recommendedVehicleIds.length > 0) {
    const recVehicles = recommendedVehicleIds
      .map((id) => vehicleMap.get(id))
      .filter((v): v is Vehicle => Boolean(v));
    const vehicleNames = recVehicles.map((v) => `${v.maker} ${v.modelName}`).join('・');
    if (vehicleNames && !displayText.includes('ご覧ください')) {
      displayText = `${displayText}\n下記の${vehicleNames}をご覧ください。`;
    }
    if (vehicleNames && !rawSpeechText.includes('ご覧ください')) {
      rawSpeechText = `${rawSpeechText} 下記の、${vehicleNames}をご覧ください。`;
    }
  }

  return {
    displayText,
    rawSpeechText,
    recommendedVehicleIds,
    effectiveBudgetMax,
  };
}
