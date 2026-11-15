import * as cheerio from 'cheerio';

async function inspect() {
  const html = await (await fetch('https://www.jp-dairin.jp/')).text();
  const $ = cheerio.load(html);

  console.log('=== STORE INFO ===');
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const storeIdx = bodyText.indexOf('店舗紹介');
  if (storeIdx !== -1) {
    console.log(bodyText.slice(storeIdx, storeIdx + 1200));
  }

  console.log('\n=== VEHICLE CARDS ===');
  const vehicleNames = [
    'アルトラパン',
    'スペーシアカスタム',
    'スペーシアベース',
    'ワゴンR',
    'ムーヴキャンバス',
    'ヤリスクロス',
  ];

  $('img').each((_, el) => {
    const src = $(el).attr('src') || '';
    const alt = $(el).attr('alt') || '';
    let node = $(el).parent();
    for (let i = 0; i < 4; i++) {
      const txt = node.text().replace(/\s+/g, ' ').trim();
      if (vehicleNames.some((v) => txt.includes(v)) && txt.includes('万円') && txt.length < 300) {
        console.log({ alt, src, text: txt });
        break;
      }
      node = node.parent();
    }
  });
}

inspect();
