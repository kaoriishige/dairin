import type { Config, Context } from '@netlify/functions';
import OpenAI from 'openai';
import type { ChatMessage, CustomerPreferences, SalesPurpose } from '../../src/types';
import { normalizeTextForSpeech } from '../../src/services/audio/speechTextNormalizer';
import { searchKnowledgeEntries, searchServices } from '../../src/services/knowledge/ragSearch';
import { parseBudgetYenFromText, searchVehicles } from '../../src/services/vehicles/vehicleSearch';
import { loadAllKnowledgeData } from './_shared/dataLoader';
import salesManualData from '../../data/knowledge/sales_manual.json';
import {
  checkRateLimit,
  detectPromptInjection,
  getClientIp,
  getEnv,
  jsonResponse,
  sanitizeUserInput,
  verifyDemoAccess,
} from './_shared/security';

interface ChatRequestBody {
  conversationId: string;
  userMessage: string;
  history: Pick<ChatMessage, 'role' | 'displayText'>[];
  preferences: CustomerPreferences;
  introducedVehicleIds: string[];
}

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  if (!verifyDemoAccess(req)) {
    return jsonResponse({ error: 'デモアクセス用のパスコードが正しくありません。' }, 401);
  }

  const ip = getClientIp(req, context);
  if (!checkRateLimit(`chat:${ip}`, 25, 60_000)) {
    return jsonResponse(
      { error: 'アクセスが集中しています。少し時間をおいてから再度お試しください。' },
      429
    );
  }

  const openaiKey = getEnv('OPENAI_API_KEY', '').trim();
  if (!openaiKey || openaiKey === 'your_openai_api_key_here') {
    return jsonResponse(
      {
        error:
          'OpenAI APIキー（OPENAI_API_KEY）がサーバー環境変数に設定されていません。管理者に設定をご依頼ください。',
        code: 'OPENAI_NOT_CONFIGURED',
      },
      503
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return jsonResponse({ error: 'リクエスト形式が不正です。' }, 400);
  }

  const userMessage = sanitizeUserInput(body.userMessage || '', 500);
  if (!userMessage) {
    return jsonResponse({ error: 'メッセージが空です。' }, 400);
  }

  if (detectPromptInjection(userMessage)) {
    return jsonResponse({
      replyDisplayText:
        '申し訳ございません。お車のご購入や車検・整備など、オートギャラリーダイリンのサービスに関するご質問をお伺いしております。どのようなお車やご相談内容でしょうか？',
      replySpeechText:
        '申し訳ございません。お車のご購入や車検、整備など、オートギャラリー・ダイリンのサービスに関するご質問をお伺いしております。どのようなご相談でしょうか？',
      recommendedVehicleIds: [],
      updatedPreferences: body.preferences,
      salesPurpose: body.preferences?.purpose ?? 'unknown',
      characterState: 'speaking',
    });
  }

  try {
    const { company, vehicles, services, knowledgeEntries } = await loadAllKnowledgeData();
    const prefs: CustomerPreferences = body.preferences ?? {
      purpose: 'unknown',
      requiredFeatures: [],
    };

    // 事前予算抽出（会話文脈の補助）
    const parsedBudget = parseBudgetYenFromText(userMessage);
    const mergedPrefs: CustomerPreferences = {
      ...prefs,
      budgetMaxYen: parsedBudget ?? prefs.budgetMaxYen ?? null,
    };

    // RAG検索＆車両検索
    const vehicleSearch = searchVehicles(vehicles, mergedPrefs, userMessage);
    const relevantKnowledge = searchKnowledgeEntries(knowledgeEntries, userMessage, 5);
    const relevantServices = searchServices(services, userMessage, 3);

    const candidateVehicles =
      vehicleSearch.exactMatches.length > 0
        ? vehicleSearch.exactMatches
        : vehicleSearch.nearMatches;

    const systemPrompt = `
あなたは株式会社ジェイ・ピー「オートギャラリーダイリン」のAI女性営業アシスタントです。
画面上の呼称は「ダイリン AI営業アシスタント」です。AIであることを隠さず、明るく丁寧で親しみやすい日本人女性営業スタッフとして接客してください。

【相談内容別の営業対応システム（必ずこの手順で接客すること）】
■ A.「中古車を探す」「予算から車を探す」の場合：
  - ステップ1（希望のヒアリングが最優先）：お客様から具体的な条件（ご予算、軽自動車／普通車、用途・人数、スライドドア等の希望装備、希望車種名）がまだ1つも出ていない段階では、絶対にいきなり車両カードを出さず（recommendedVehicleIds は必ず空配列 [] にする）、まず「かしこまりました！ご希望に合うお車をお探ししますね。ご予算や、軽自動車・普通車などのご希望はございますか？」のように希望条件を1つ伺うこと。
  - ステップ2（条件確認後の車両提案）：お客様が条件を1つ以上伝えてきたら、「exactMatches / nearMatches」から条件に合う実在車両を1〜2台提案し、recommendedVehicleIds にその vehicle.id を入れ、説明の最後に必ず「下記の〇〇（車種名）をご覧ください。」と案内すること。
■ B.「新車を探す」の場合：
  - まず「ご希望のメーカーや車種、またはご予算・用途などはございますか？」と希望を伺い、国産各メーカー対応・店舗での見積り相談を案内する。
■ C.「車検・点検の相談」の場合：
  - まず「お乗りのお車（軽自動車・普通車など）や車検の時期はお決まりですか？」と確認しつつ、公式HP記載の目安情報があれば伝え、正確なお見積りは店舗（0287-36-6011 / 公式LINE）へ案内する。
■ D.「車の買取相談」の場合：
  - まず「現在お乗りのお車の車種・年式・走行距離などはわかりますか？」と伺い、無料査定・出張査定（公式HP記載範囲）と店舗連絡を案内する。
■ E.「カーリース・修理/鈑金・その他」の場合：
  - まずお客様の具体的な状況やご希望を1つ伺ってから、公式HP記載の事実のみで回答し、詳細見積りや個別判断は店舗（0287-36-6011 / 公式LINE / WEBフォーム）へ案内する。
■ F.「不具合・クレーム・保証・契約トラブル」のご相談の場合：
  - AI側で原因の断定・責任判断・無償修理や補償の約束は絶対に行わず、まずは「ご不便をおかけしております」と丁寧にお詫び・共感したうえで、お名前・車種・症状をお伺いし、担当スタッフが迅速に対応できるよう直ちにオートギャラリーダイリン（電話：0287-36-6011）へ直接ご連絡いただくよう案内する。

【業界標準 営業マニュアル＆トラブル防止規定（厳守）】
${salesManualData.coreRule}
${salesManualData.manuals
  .map(
    (m) =>
      `・[${m.category}] 手順: ${m.steps.join(' / ')} ｜ 禁止事項: ${m.prohibitedActions.join('・')}`
  )
  .join('\n')}

【最優先ルール】
1. お客様の話を正確に理解し、自然な日本語の話し言葉で短く会話する（1回の回答は2〜4文、原則120〜200文字程度）。
2. 質問を一度に大量に並べない。原則として1回につき質問は1つまで。
3. お客様がすでに伝えた条件（予算・車種・用途・人数など）は絶対に聞き直さない。
4. 【厳守・最重要】下記に提供されたオートギャラリーダイリン公式ホームページのデータのみを事実として案内すること。ホームページに記載がない情報（未掲載の車両・詳細な装備・支払総額・値引き・具体的な買取査定額・修理金額・ローン金利・納期・現在の在庫有無など）や分からない質問については、AIが推測や一般論で勝手に答えることを一切禁止する。分からない情報・ホームページに記載がない情報は、必ず「ホームページ上に記載がないため、お手数ですがオートギャラリーダイリン（電話：0287-36-6011、または公式LINE・WEBお問い合わせフォーム）まで直接ご連絡・ご確認ください」と案内すること。
5. 車両を紹介する場合は必ず「exactMatches / nearMatches」にある実在の vehicle.id のみを recommendedVehicleIds に含める。お客様から予算上限（「1,000,000円以内」「100万円以下」等）が示されている場合は、本体価格がその予算上限を超える車両は絶対に提案・紹介しないこと。車両（画像付きカード）を紹介する際は、説明の最後に必ず「下記の〇〇（車種名）をご覧ください。」とお客様を下部の車両画像へ誘導する一言を入れること。予算内や条件にぴったり合う掲載車両が見つからない場合は無理に高い車をおすすめせず、正直にその旨を伝えて店舗相談（0287-36-6011）を案内する。
6. 掲載車両はすでに売約済みの可能性があるため、「ホームページ掲載車両ですので現在の在庫状況は店舗へご確認ください」と一言添える。本体価格と支払総額を混同しない。
7. 営業時間・電話受付時間は公式サイト内で「9:00〜18:00」と「10:00〜18:00」の記載揺れがあるため断定せず「店舗案内では10時から18時、お電話窓口のご案内では9時から18時となっておりますので、ご来店の際は事前にお電話でご確認いただくと安心です」と案内する。
8. 車検料金は「目安」として案内し、初年度登録13年・18年超や車両状態により変わるためお見積りが必要と伝える。
9. 予約管理システムと未接続のため、来店相談時は「予約確定」とは言わず、お電話（0287-36-6011）やお問い合わせフォーム、公式LINEでのご連絡を案内する。
10. 保険は一般的なサービス説明にとどめ、特定商品の推奨や引受判断は行わない。
11. 画面表示用テキスト（replyDisplayText）は、お客様が画面で読みやすいよう通常の漢字・算用数字（例：「100万円」「2017年式」「82.5万円」「本体価格」「走行距離29,000km」）で作成すること。
12. 音声読み上げ用テキスト（replySpeechText）は、漢数字（二千十七など）は絶対に使わず、算用数字（2017年・29,000km・82.5万円）またはひらがなで自然な話し言葉にすること（システム側で自動ひらがな変換されます）。

【既に確認済みのお客様条件】
${JSON.stringify(mergedPrefs, null, 2)}
【既に紹介済みの車両ID】
${JSON.stringify(body.introducedVehicleIds ?? [])}

【会社・店舗情報（公式データ）】
会社名: ${company.companyName} / 店舗名: ${company.storeName}
住所: 〒${company.postalCode} ${company.address}
電話: ${company.phone}
定休日: ${company.holidays}
営業時間: ${company.businessHours}

【関連する営業知識（承認済み）】
${relevantKnowledge.map((k) => `・[${k.category}] ${k.title}: ${k.content}`).join('\n')}

【関連するサービス情報】
${relevantServices
  .map(
    (s) =>
      `・[${s.category}] ${s.title}: ${s.summary} / 詳細: ${s.details.join(' / ')}${
        s.priceTable ? ` / 料金目安: ${JSON.stringify(s.priceTable.rows)}` : ''
      }`
  )
  .join('\n')}

【検索された公式掲載車両（exactMatches: 条件一致 / nearMatches: 近い候補）】
exactMatches: ${JSON.stringify(
      vehicleSearch.exactMatches.map((v) => ({
        id: v.id,
        maker: v.maker,
        modelName: v.modelName,
        grade: v.grade,
        category: v.category,
        year: v.year,
        mileage: v.mileage,
        bodyType: v.bodyType,
        basePriceText: v.basePriceText,
        features: v.features,
      }))
    )}
nearMatches: ${JSON.stringify(
      vehicleSearch.nearMatches.map((v) => ({
        id: v.id,
        maker: v.maker,
        modelName: v.modelName,
        grade: v.grade,
        category: v.category,
        year: v.year,
        mileage: v.mileage,
        bodyType: v.bodyType,
        basePriceText: v.basePriceText,
        features: v.features,
      }))
    )}

【出力JSONフォーマット（厳守）】
{
  "replyDisplayText": "画面に表示する営業回答文（通常の読みやすい漢字かな交じり文）",
  "replySpeechText": "音声読み上げ用の自然な日本語文（URLや記号は含めず、自然な抑揚で読める漢字かな交じり文）",
  "recommendedVehicleIds": ["今回紹介する車両ID（なければ空配列）"],
  "salesPurpose": "used_car | new_car | budget_search | inspection | buyback | car_lease | body_paint | other | unknown",
  "updatedPreferences": {
    "purpose": "...",
    "budgetMaxYen": 数値またはnull,
    "preferredCarType": "軽自動車 | 普通車 | null",
    "preferredMaker": "メーカー名またはnull",
    "usagePurpose": "用途またはnull",
    "passengerCount": 数値またはnull,
    "requiredFeatures": ["希望装備"],
    "purchaseTiming": "時期またはnull"
  }
}
`.trim();

    const openai = new OpenAI({ apiKey: openaiKey });
    const model = getEnv('OPENAI_MODEL', 'gpt-4o-mini');

    const recentHistory = (body.history ?? []).slice(-10).map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.displayText,
    }));

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 650,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        ...recentHistory,
        { role: 'user', content: userMessage },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content ?? '{}';
    let parsed: {
      replyDisplayText?: string;
      replySpeechText?: string;
      recommendedVehicleIds?: string[];
      salesPurpose?: SalesPurpose;
      updatedPreferences?: Partial<CustomerPreferences>;
    } = {};

    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = { replyDisplayText: rawContent, replySpeechText: rawContent };
    }

    // 実在する車両IDのみを厳格に許可（LLMによる架空ID防止）
    // ただし、まだ購入条件（予算・車種・メーカー・用途・人数・装備・具体的な車名指定）が一切確認できていない初回は、必ず希望ヒアリングを優先し車両カードは出さない
    const hasAnyCondition =
      Boolean(mergedPrefs.budgetMaxYen) ||
      Boolean(mergedPrefs.preferredCarType) ||
      Boolean(mergedPrefs.preferredMaker) ||
      Boolean(mergedPrefs.usagePurpose) ||
      Boolean(mergedPrefs.passengerCount) ||
      (mergedPrefs.requiredFeatures?.length ?? 0) > 0 ||
      Boolean(parsed.updatedPreferences?.budgetMaxYen) ||
      Boolean(parsed.updatedPreferences?.preferredCarType) ||
      Boolean(parsed.updatedPreferences?.preferredMaker) ||
      Boolean(parsed.updatedPreferences?.usagePurpose) ||
      Boolean(parsed.updatedPreferences?.passengerCount) ||
      (parsed.updatedPreferences?.requiredFeatures?.length ?? 0) > 0 ||
      vehicles.some((v) => userMessage.includes(v.modelName) || userMessage.includes(v.maker));

    const effectiveBudgetMax =
      mergedPrefs.budgetMaxYen ?? parsed.updatedPreferences?.budgetMaxYen ?? null;
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
    const recommendedVehicleIds = hasAnyCondition
      ? (parsed.recommendedVehicleIds ?? [])
          .filter((id) => {
            const v = vehicleMap.get(id);
            if (!v) return false;
            if (effectiveBudgetMax && v.basePriceYen && v.basePriceYen > effectiveBudgetMax) {
              return false;
            }
            return true;
          })
          .slice(0, 3)
      : [];

    let displayText =
      parsed.replyDisplayText?.trim() ||
      'お問い合わせありがとうございます。詳しくお伺いできますでしょうか。';

    let rawSpeechText = parsed.replySpeechText?.trim() || displayText;

    // 車両画像（カード）を表示する場合は、説明の最後に必ず「下記の〇〇をご覧ください」と誘導する
    if (recommendedVehicleIds.length > 0) {
      const recVehicles = recommendedVehicleIds
        .map((id) => vehicles.find((v) => v.id === id))
        .filter((v): v is NonNullable<typeof v> => Boolean(v));
      const vehicleNames = recVehicles.map((v) => `${v.maker} ${v.modelName}`).join('・');
      if (vehicleNames && !displayText.includes('ご覧ください')) {
        displayText = `${displayText}\n下記の${vehicleNames}をご覧ください。`;
      }
      if (vehicleNames && !rawSpeechText.includes('ご覧ください')) {
        rawSpeechText = `${rawSpeechText} 下記の、${vehicleNames}をご覧ください。`;
      }
    }

    const speechText = normalizeTextForSpeech(rawSpeechText);

    const updatedPreferences: CustomerPreferences = {
      ...mergedPrefs,
      ...(parsed.updatedPreferences ?? {}),
      purpose: parsed.salesPurpose ?? mergedPrefs.purpose,
      requiredFeatures: Array.from(
        new Set([
          ...(mergedPrefs.requiredFeatures ?? []),
          ...(parsed.updatedPreferences?.requiredFeatures ?? []),
        ])
      ),
    };

    return jsonResponse({
      replyDisplayText: displayText,
      replySpeechText: speechText,
      recommendedVehicleIds,
      candidateCount: candidateVehicles.length,
      salesPurpose: updatedPreferences.purpose,
      updatedPreferences,
      characterState: recommendedVehicleIds.length > 0 ? 'introducing_vehicle' : 'speaking',
      modelUsed: model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Chat function error:', message);
    return jsonResponse(
      {
        error: 'AI営業アシスタントとの通信中にエラーが発生しました。少し時間をおいて再度お試しください。',
        detail: message,
      },
      500
    );
  }
};

export const config: Config = {
  path: '/api/chat',
};
