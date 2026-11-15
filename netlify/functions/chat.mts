import type { Config, Context } from '@netlify/functions';
import OpenAI from 'openai';
import type { ChatMessage, CustomerPreferences, SalesPurpose } from '../../src/types';
import { normalizeTextForSpeech } from '../../src/services/audio/speechTextNormalizer';
import { searchKnowledgeEntries, searchServices } from '../../src/services/knowledge/ragSearch';
import { parseBudgetYenFromText, searchVehicles } from '../../src/services/vehicles/vehicleSearch';
import { loadAllKnowledgeData } from './_shared/dataLoader';
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

【最優先ルール】
1. お客様の話を正確に理解し、自然な日本語の話し言葉で短く会話する（1回の回答は2〜4文、原則150〜220文字程度）。
2. 質問を一度に大量に並べない。原則として1回につき質問は1つまで。
3. お客様がすでに伝えた条件（予算・車種・用途・人数など）は絶対に聞き直さない。
4. 下記に提供されたダイリン公式データのみを事実として案内し、存在しない車両・装備・支払総額・買取金額・修理金額を絶対に作らない。
5. 車両を紹介する場合は必ず「exactMatches / nearMatches」にある実在の vehicle.id のみを recommendedVehicleIds に含める。完全一致がない場合は「条件にぴったり合う掲載車両が見つからない」ことを正直に伝え、近い掲載車両または店舗相談を案内する。
6. 掲載車両はすでに売約済みの可能性があるため、「ホームページ掲載車両ですので現在の在庫状況は店舗へご確認ください」と一言添える。本体価格と支払総額を混同しない。
7. 営業時間・電話受付時間は公式サイト内で「9:00〜18:00」と「10:00〜18:00」の記載揺れがあるため断定せず「店舗案内では10時から18時、お電話窓口のご案内では9時から18時となっておりますので、ご来店の際は事前にお電話でご確認いただくと安心です」と案内する。
8. 車検料金は「目安」として案内し、初年度登録13年・18年超や車両状態により変わるためお見積りが必要と伝える。
9. 予約管理システムと未接続のため、来店相談時は「予約確定」とは言わず、お電話（0287-36-6011）やお問い合わせフォーム、公式LINEでのご連絡を案内する。
10. 保険は一般的なサービス説明にとどめ、特定商品の推奨や引受判断は行わない。
11. 音声読み上げ用テキスト（replySpeechText）は、ElevenLabsが漢字や数字・英字を読み間違えるのを完全に防ぐため、【漢字・算用数字（0-9）・アルファベット（A-Z）を一切使わず、すべて発音通りの「ひらがな・カタカナ・句読点（、。）・感嘆符（！）・長音（ー）」のみ】で作成すること。
   - 良い例：「ひゃくまんえんのごよさんで、けいじどうしゃをおさがしですね！げんざい、スズキのワゴンアール、にせんじゅうななねんしき、ほんたいかかく、はちじゅうにまんごせんえんや、アルトラパンがございます。げんざいのざいこじょうきょうは、てんぽへごかくにんください。」
   - 悪い例：「100万円のご予算で軽自動車をお探しですね（漢字や数字が残っていると誤読されます）」
   - 特に注意する読み：AI→エーアイ、お車→おくるま、新車→しんしゃ、中古車→ちゅうこしゃ、軽自動車→けいじどうしゃ、車検→しゃけん、鈑金→ばんきん、1台→いちだい、2人→ふたり、6ヶ月→ろっかげつ、2WD→にダブリューディー、HV→ハイブリッド、那須塩原市新南→なすしおばらし、しんみなみ。

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
  "replySpeechText": "音声読み上げ専用の全文ひらがな・カタカナ表記（漢字・数字・英字・URL・記号を一切含めない）",
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
      temperature: 0.4,
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
    const validIds = new Set(vehicles.map((v) => v.id));
    const recommendedVehicleIds = (parsed.recommendedVehicleIds ?? [])
      .filter((id) => validIds.has(id))
      .slice(0, 3);

    const displayText =
      parsed.replyDisplayText?.trim() ||
      'お問い合わせありがとうございます。詳しくお伺いできますでしょうか。';

    const speechText = normalizeTextForSpeech(parsed.replySpeechText?.trim() || displayText);

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
