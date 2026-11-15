import fs from 'node:fs/promises';
import OpenAI from 'openai';

async function runLiveScenarioTests() {
  const vehicles = JSON.parse(await fs.readFile('data/vehicles/vehicles.json', 'utf-8'));
  const services = JSON.parse(await fs.readFile('data/services/services.json', 'utf-8'));
  const company = JSON.parse(await fs.readFile('data/knowledge/company.json', 'utf-8'));

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const testCases = [
    { name: 'テスト1：中古車購入相談', q: '100万円くらいで軽自動車を探しています' },
    { name: 'テスト2：家族向け車両', q: '子どもが2人いるので、スライドドアの車を探しています' },
    { name: 'テスト3：車検', q: '軽自動車の車検はいくらですか？' },
    { name: 'テスト4：車の買取', q: '2018年式の車を買い取ってもらえますか？' },
    { name: 'テスト5：カーリース', q: '毎月の支払いを抑えて新車に乗りたいです' },
    { name: 'テスト6：来店相談', q: 'お店はどこにありますか？' },
  ];

  for (const tc of testCases) {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `あなたは株式会社ジェイ・ピー「オートギャラリーダイリン」のAI女性営業アシスタントです。
会社情報: ${JSON.stringify(company)}
サービス情報: ${JSON.stringify(services)}
掲載車両: ${JSON.stringify(vehicles.map((v) => ({ id: v.id, maker: v.maker, modelName: v.modelName, grade: v.grade, category: v.category, year: v.year, mileage: v.mileage, bodyType: v.bodyType, basePriceText: v.basePriceText })))}
出力は JSON {"replyDisplayText": "...", "recommendedVehicleIds": [...]} のみ。1回の回答は短く自然な話し言葉にし、質問は1つまで。`,
        },
        { role: 'user', content: tc.q },
      ],
    });
    const out = JSON.parse(res.choices[0].message.content);
    console.log(`[${tc.name}]`);
    console.log(`  Q: ${tc.q}`);
    console.log(`  A: ${out.replyDisplayText}`);
    console.log(`  Vehicles: ${JSON.stringify(out.recommendedVehicleIds)}`);
  }
}

runLiveScenarioTests();
