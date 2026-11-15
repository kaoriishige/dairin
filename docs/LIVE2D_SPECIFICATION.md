# ダイリンAI営業キャラクター｜アニメーション実装＆Live2Dモデル化仕様書

## 1. 現在のキャラクター画像の調査結果

- **対象画像**: `dairin_ai_sales_character_final.png`（配置先: `public/images/dairin_ai_sales_character.png`）
- **解像度・形式**: `1024 × 935 px` / 単一レイヤー統合PNG（RGB）
- **視覚的特徴**:
  - 黒髪（編み込みハーフアップ＋ロングヘア）
  - 紺色ジャケット、白いシャツ、青と白のストライプスカーフ
  - 左胸に「Auto Gallery DAIRIN」名札
  - 右手を広げて案内しているポーズ、口を開けた笑顔
- **レイヤー状態**:
  - PSD等のレイヤー分け原画データは存在せず、前髪と眉・目、輪郭と後ろ髪、スカーフと襟元などが1枚の画像に統合されている状態です。
  - 指示書第4章・第7章の「PNG画像をそのままLive2Dモデルとして扱わないこと」「必要なLive2Dモデルが未完成の場合は、仮の動きを完成品として納品しないこと」に基づき、以下の**2段階構成**を採用しています。

---

## 2. 現在稼働中の2.5Dリアルタイム会話アニメーション（実装済み）

単一PNGの顔・髪型・制服・スカーフ・名札のデザインを1ピクセルも損なわず、即座に営業デモとして自然な会話ができるよう、以下のパーツ抽出と60fps Canvasレンダリングを実装しています。

### 2.1 生成・配置済み差分パーツ（`public/images/parts/`）
1. **目パーツ（座標 `X=435, Y=245, W=255, H=88`）**
   - `eyes_open.png`：通常開眼
   - `eyes_half.png`：半目（まばたき中間・微笑み）
   - `eyes_closed.png`：閉眼（前髪を一切変形させず、まぶたの肌色とアイラインで自然に閉じた差分）
2. **日本語母音別・口パーツ（座標 `X=520, Y=360, W=132, H=76`）**
   - `mouth_closed.png`：無音時・待機時に口を閉じた自然な微笑み差分
   - `mouth_a.png`：母音「あ」（大きく開いた口）
   - `mouth_i.png`：母音「い」（横に引いた明るい口）
   - `mouth_u.png`：母音「う」（すぼめた小さな口）
   - `mouth_e.png`：母音「え」（中程度に横に開いた口）
   - `mouth_o.png`：母音「お」（縦丸く開いた口）

### 2.2 音声同期・自然な身体動作の制御仕様
- **ElevenLabs TTS連携**: 指定Voice ID `tmmztcupA9Eu81ix80hq` で生成した音声を Web Audio API (`AnalyserNode`) でリアルタイム解析。
- **フォルマント母音推定**: 低域エネルギーおよび第1フォルマント（F1: 300〜900Hz）・第2フォルマント（F2: 900〜2800Hz）の比率から毎フレーム `'closed' | 'a' | 'i' | 'u' | 'e' | 'o'` を推定し、48msの最小保持時間で滑らかに口形状を切り替え。
- **音声停止時の確実な閉口**: 音声再生終了時・割り込み停止時・無音区間（`audioLevel <= 0.065`）では即座に `mouth_closed.png` に切り替わり、確実に口が閉じます。
- **非周期的な自然動作**:
  - **まばたき**: 2.2〜5.6秒の不規則な間隔＋22%の確率でダブルブリンクを実行。
  - **呼吸・うなずき・首の傾き**: 互いに素な複数周波数の正弦波（`1.45Hz`, `0.85Hz`, `0.92Hz` 等）を合成し、機械的な反復のない呼吸運動と会話中のうなずき・首元の微細な傾きを表現。

---

## 3. 本格Live2D Cubism モデル（`.moc3` / `.model3.json`）制作に必要な不足素材と工程

将来、3軸（角度X・Y・Z）の立体的な顔の向き変化や髪の毛・スカーフの物理演算を含む**本格Live2D Cubismモデル**へアップグレードする場合、単一PNGからの自動分割では「前髪の裏にある額や眉」「閉じた唇の裏の肌」「首の後ろの後ろ髪」「右腕の裏の胴体」の描き足し（インペイント）が不足するため、以下のレイヤー分割PSD素材と制作工程が必要です。

### 3.1 必要なレイヤー分割PSD素材一覧（最低25レイヤー）

| カテゴリ | レイヤー名 | 必要な描き足し（単一PNGに不足している裏面素材） | 対応するLive2Dパラメータ |
| :--- | :--- | :--- | :--- |
| **頭部・顔** | `Face_Base`（顔輪郭・肌） | 前髪・横髪・口・目で隠れている肌領域の塗り足し | `ParamAngleX`, `ParamAngleY`, `ParamAngleZ` |
| **眉毛** | `Brow_L`, `Brow_R` | 前髪から独立した左右の眉レイヤー | `ParamBrowLY`, `ParamBrowRY`, `ParamBrowLAngle` |
| **目（左右）** | `Eye_L_UpperEyelash`, `Eye_L_LowerEyelash`, `Eye_L_White`, `Eye_L_Iris`, `Eye_L_Highlight`（右目も同様） | 白目（強膜）と瞳（虹彩）、ハイライト、上まつげ・下まつげの完全分離（クリッピング用） | `ParamEyeLOpen`, `ParamEyeLSmile`, `ParamEyeBallX`, `ParamEyeBallY` |
| **鼻・頬** | `Nose`, `Cheek_Blush` | 立体移動用の鼻筋・チーク独立レイヤー | `ParamAngleX`, `ParamCheek` |
| **口** | `Mouth_UpperLip`, `Mouth_LowerLip`, `Mouth_Inside`, `Teeth_Upper`, `Tongue` | 上唇・下唇の肌色境界と、口内（口腔・上の歯・舌）の独立レイヤー | `ParamMouthOpenY`, `ParamMouthForm` |
| **髪** | `Hair_Front_Center`, `Hair_Front_SideL`, `Hair_Front_SideR`, `Hair_Braid_Crown`, `Hair_Back` | 顔や首・肩の後ろに回り込む後ろ髪（`Hair_Back`）の描き足し | `ParamHairFront`, `ParamHairSide`, `ParamHairBack` |
| **首** | `Neck` | 顎の下〜シャツ襟の中まで続く首の描き足し | `ParamAngleX`, `ParamAngleY`, `ParamBodyAngleX` |
| **上半身・制服** | `Body_Jacket`, `Shirt_Collar`, `Scarf_Knot`, `Scarf_Ribbon_A`, `Scarf_Ribbon_B`, `Badge_DAIRIN` | スカーフの結び目と揺れるリボン先端の分離、名札の独立レイヤー | `ParamBodyAngleX`, `ParamBodyAngleZ`, `ParamBreath` |
| **腕・手** | `Arm_R_Upper`, `Arm_R_Forearm`, `Hand_R_Palm`, `Arm_L` | 右腕を動かした際に露出するジャケット側面の描き足し | `ParamArmR`, `ParamHandR` |

### 3.2 Live2Dモデル化の制作工程（ワークフロー）
1. **工程1：PSDパーツ分け・裏面描き足し（イラストレーターまたはPSD分割工程）**
   - `dairin_ai_sales_character_final.png` のデザイン（顔立ち・髪型・制服・名札）を厳守したまま、上記表の通り各パーツを独立レイヤー化し、重なり部分（前髪の裏の眉・額、顎の下の首、スカーフ裏のシャツ等）を描き足した `.psd` ファイルを作成する。
2. **工程2：Live2D Cubism Editor でのモデリング**
   - PSDをインポートし、アートメッシュ生成 → ワープデフォーマ・回転デフォーマ設定。
   - 母音リップシンク用に `ParamMouthOpenY`（開閉 0.0〜1.0）× `ParamMouthForm`（変形 -1.0〜+1.0：あ・い・う・え・お）の2次元キーフォームを作成する。
   - 前髪・横髪・スカーフに物理演算（`.physics3.json`）を設定する。
3. **工程3：組込み用データの書き出しと配置**
   - Live2D Cubism Editor から以下のランタイムファイル一式を書き出し、`public/live2d/` ディレクトリに配置する：
     - `dairin.moc3`
     - `dairin.model3.json`
     - `dairin.physics3.json`
     - `dairin.cdi3.json`
     - `textures/texture_00.png`
4. **工程4：Webシステムとの接続**
   - 本システムの `elevenLabsPlayer.ts` が算出する `audioLevel`（`ParamMouthOpenY` へ入力）および `MouthVowelShape`（`ParamMouthForm` へ入力）を Live2D Cubism SDK for Web の `coreModel.setParameterValueById()` にバインドすることで、既存の音声合成・営業会話パイプラインをそのままLive2Dモデルへ直結できます。
