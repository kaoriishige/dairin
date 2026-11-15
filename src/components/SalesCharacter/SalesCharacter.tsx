import React, { useEffect, useRef, useState } from 'react';
import { Mic, Sparkles, Volume2, Car, Clock, MessageSquareHeart } from 'lucide-react';
import type { CharacterState } from '../../types';
import type { LiveVoiceMetrics, MouthVowelShape } from '../../services/audio/elevenLabsPlayer';

export interface SalesCharacterProps {
  state: CharacterState;
  audioLevel?: number;
  vowel?: MouthVowelShape;
  getLiveVoiceMetrics?: () => LiveVoiceMetrics;
  subtitle?: string;
  onPlaySampleVoice?: () => void;
  onPlayTestGreeting?: () => void;
}

const CANVAS_W = 1024;
const CANVAS_H = 935;

// 元画像 (1024x935) の目・口パーツ領域
const EYE_RECT = { x: 435, y: 245, w: 255, h: 88 };
const EYE_STEPS = 10; // eyes_atlas.png: 255 x 880 (縦10段階の連続まばたき)

const MOUTH_RECT = { x: 520, y: 360, w: 132, h: 76 };
const MOUTH_COLS = 16; // mouth_atlas.png: 横16段階の連続口開き (0.00 .. 1.00)

const STATE_CONFIG: Record<
  CharacterState,
  { label: string; subLabel: string; badgeClass: string; ringClass: string; Icon: React.ElementType }
> = {
  idle: {
    label: '待機中',
    subLabel: 'いつでも話しかけてください',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    ringClass: 'ring-blue-100',
    Icon: Clock,
  },
  listening: {
    label: 'お話を伺っています',
    subLabel: 'マイクに向かってお話しください',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    ringClass: 'ring-emerald-300',
    Icon: Mic,
  },
  thinking: {
    label: '回答を準備しています',
    subLabel: 'ダイリンの情報を確認中…',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    ringClass: 'ring-amber-200',
    Icon: Sparkles,
  },
  speaking: {
    label: 'ご案内中',
    subLabel: 'AI営業アシスタントがお話ししています',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    ringClass: 'ring-blue-400',
    Icon: Volume2,
  },
  introducing_vehicle: {
    label: 'お車をご紹介中',
    subLabel: 'ご希望に合う掲載車両を表示しています',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-300',
    ringClass: 'ring-sky-400',
    Icon: Car,
  },
};

const VOWEL_LABELS: Record<MouthVowelShape, string> = {
  closed: '閉',
  a: 'あ',
  i: 'い',
  u: 'う',
  e: 'え',
  o: 'お',
};

interface LoadedAtlases {
  base: HTMLImageElement;
  eyesAtlas: HTMLImageElement;
  mouthAtlas: HTMLImageElement;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * 連続時間 now (ms) から、現在のまばたき閉眼率 (0.000 = 開眼 .. 1.000 = 閉眼) を
 * コサイン補間で滑らかに算出する（カクつきゼロの60fps連続カーブ）。
 */
function evaluateBlinkClosure(elapsedMs: number, isDoubleBlink: boolean): {
  closure: number;
  finished: boolean;
} {
  // 1回目のまばたき (0..185ms)
  const closeDur = 72;
  const holdDur = 20;
  const openDur = 93;
  const singleTotal = closeDur + holdDur + openDur; // 185ms

  const evalSingle = (t: number): number => {
    if (t < 0 || t >= singleTotal) return 0;
    if (t < closeDur) {
      return 0.5 * (1 - Math.cos(Math.PI * (t / closeDur)));
    }
    if (t < closeDur + holdDur) {
      return 1.0;
    }
    const openT = (t - closeDur - holdDur) / openDur;
    return 0.5 * (1 + Math.cos(Math.PI * openT));
  };

  if (!isDoubleBlink) {
    if (elapsedMs >= singleTotal) return { closure: 0, finished: true };
    return { closure: evalSingle(elapsedMs), finished: false };
  }

  // ダブルブリンク時は 110ms 空けて2回目を実行
  const secondStart = singleTotal + 95;
  const doubleTotal = secondStart + singleTotal;
  if (elapsedMs >= doubleTotal) return { closure: 0, finished: true };
  if (elapsedMs < singleTotal) {
    return { closure: evalSingle(elapsedMs), finished: false };
  }
  if (elapsedMs >= secondStart) {
    return { closure: evalSingle(elapsedMs - secondStart), finished: false };
  }
  return { closure: 0, finished: false };
}

export const SalesCharacter: React.FC<SalesCharacterProps> = ({
  state,
  audioLevel = 0,
  vowel = 'closed',
  getLiveVoiceMetrics,
  subtitle,
  onPlaySampleVoice,
  onPlayTestGreeting,
}) => {
  const cfg = STATE_CONFIG[state];
  const StatusIcon = cfg.Icon;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const atlasesRef = useRef<LoadedAtlases | null>(null);
  const [atlasesReady, setAtlasesReady] = useState(false);

  const stateRef = useRef<CharacterState>(state);
  const propLevelRef = useRef<number>(audioLevel);
  const propVowelRef = useRef<MouthVowelShape>(vowel);
  const getMetricsRef = useRef<(() => LiveVoiceMetrics) | undefined>(getLiveVoiceMetrics);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    propLevelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    propVowelRef.current = vowel;
  }, [vowel]);

  useEffect(() => {
    getMetricsRef.current = getLiveVoiceMetrics;
  }, [getLiveVoiceMetrics]);

  // 1. ベース画像＋連続10段階まばたきアトラス＋連続16×3段階口形アトラスをプリロード
  useEffect(() => {
    let cancelled = false;

    async function preload() {
      try {
        const [base, eyesAtlas, mouthAtlas] = await Promise.all([
          loadImage('/images/dairin_ai_sales_character.png?v=2'),
          loadImage('/images/parts/eyes_atlas.png?v=2'),
          loadImage('/images/parts/mouth_atlas.png?v=2'),
        ]);
        if (cancelled) return;

        const offCanvas = document.createElement('canvas');
        offCanvas.width = CANVAS_W;
        offCanvas.height = CANVAS_H;
        offscreenCanvasRef.current = offCanvas;

        atlasesRef.current = { base, eyesAtlas, mouthAtlas };
        setAtlasesReady(true);
      } catch {
        // テスト環境等ではフォールバック<img>を表示
      }
    }

    void preload();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. 60fps 無段階補間アニメーション＆2.5Dストリップメッシュ変形レンダラー
  useEffect(() => {
    if (!atlasesReady || !atlasesRef.current || !canvasRef.current || !offscreenCanvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const offCanvas = offscreenCanvasRef.current;
    const offCtx = offCanvas.getContext('2d');
    if (!ctx || !offCtx) return;

    let rafId = 0;
    const startTime = performance.now();

    // 連続補間状態（物理ダンパー用）
    let smoothOpenY = 0; // 0.000 .. 1.000
    let smoothFormRow = 1.0; // 0.000 .. 2.000
    let smoothNodY = 0; // px
    let smoothHeadSwayX = 0; // px
    let smoothEyeSquint = 0; // 0.000 .. 0.350

    // 不規則まばたきタイマー状態（requestAnimationFrame内で連続評価）
    let nextBlinkAt = startTime + 1800 + Math.random() * 2600;
    let blinkStartedAt: number | null = null;
    let blinkIsDouble = false;

    const renderFrame = (now: number) => {
      const atlases = atlasesRef.current;
      if (!atlases) return;

      const t = (now - startTime) / 1000;
      const curState = stateRef.current;
      const isSpeakingLike = curState === 'speaking' || curState === 'introducing_vehicle';

      // --- (A) Web Audio API から直接60fpsで連続口形パラメータを取得 ---
      const live = getMetricsRef.current?.();
      let targetOpenY = 0;
      let targetFormRow = 1.0;
      let activeLevel = 0;

      if (live && live.isPlaying) {
        activeLevel = live.level;
        // 発話のリズムに合わせて自然な音節の抑揚（シラブルパルス）を加味し、無段階に開閉
        const syllableWave = 0.85 + 0.15 * Math.sin(t * 16.5);
        targetOpenY = Math.min(1, live.openY * syllableWave);
        targetFormRow = live.formRow;
      } else if (isSpeakingLike && propLevelRef.current > 0.05) {
        activeLevel = propLevelRef.current;
        targetOpenY = Math.min(1, propLevelRef.current);
      } else {
        // 音声停止時はターゲット0（閉口）
        activeLevel = 0;
        targetOpenY = 0;
        targetFormRow = 1.0;
      }

      // 60fps スプリング補間（急激なジャンプを無くし、人間の唇の開閉速度で滑らかに追従）
      const openLerp = targetOpenY > smoothOpenY ? 0.36 : 0.22;
      smoothOpenY += (targetOpenY - smoothOpenY) * openLerp;
      if (smoothOpenY < 0.005 && targetOpenY === 0) {
        smoothOpenY = 0;
      }
      smoothFormRow += (targetFormRow - smoothFormRow) * 0.16;

      // --- (B) 連続まばたきカーブの評価 (0.000 .. 1.000) ---
      if (blinkStartedAt === null && now >= nextBlinkAt) {
        blinkStartedAt = now;
        blinkIsDouble = Math.random() < 0.22;
      }

      let blinkClosure = 0;
      if (blinkStartedAt !== null) {
        const res = evaluateBlinkClosure(now - blinkStartedAt, blinkIsDouble);
        if (res.finished) {
          blinkStartedAt = null;
          nextBlinkAt = now + 2400 + Math.random() * 3400;
          blinkClosure = 0;
        } else {
          blinkClosure = res.closure;
        }
      }

      // 会話の盛り上がりに合わせた優しい微笑み目元（0.0 .. 0.25）の滑らかなブレンド
      const targetSquint =
        isSpeakingLike && activeLevel > 0.55 ? (activeLevel - 0.55) * 0.55 : 0;
      smoothEyeSquint += (targetSquint - smoothEyeSquint) * 0.1;
      const totalEyeClosure = Math.min(1.0, Math.max(blinkClosure, smoothEyeSquint));

      // --- (C) オフスクリーンCanvasにベース画像＋連続補間目元＋連続補間口元を合成 ---
      offCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      offCtx.drawImage(atlases.base, 0, 0, CANVAS_W, CANVAS_H);

      // 1. 目元の無段階サブフレーム補間描画 (10段階アトラス + 隣接フレームαブレンド)
      if (totalEyeClosure > 0.005) {
        const eyeStepFloat = totalEyeClosure * (EYE_STEPS - 1);
        const step0 = Math.min(EYE_STEPS - 1, Math.floor(eyeStepFloat));
        const step1 = Math.min(EYE_STEPS - 1, step0 + 1);
        const fracEye = eyeStepFloat - step0;

        offCtx.globalAlpha = 1.0;
        offCtx.drawImage(
          atlases.eyesAtlas,
          0,
          step0 * EYE_RECT.h,
          EYE_RECT.w,
          EYE_RECT.h,
          EYE_RECT.x,
          EYE_RECT.y,
          EYE_RECT.w,
          EYE_RECT.h
        );
        if (fracEye > 0.01 && step1 !== step0) {
          offCtx.globalAlpha = fracEye;
          offCtx.drawImage(
            atlases.eyesAtlas,
            0,
            step1 * EYE_RECT.h,
            EYE_RECT.w,
            EYE_RECT.h,
            EYE_RECT.x,
            EYE_RECT.y,
            EYE_RECT.w,
            EYE_RECT.h
          );
        }
        offCtx.globalAlpha = 1.0;
      }

      // 2. 口元の無段階サブフレーム補間描画 (16段階開度 × 3段階母音横幅アトラス + 2次元αブレンド)
      const colFloat = Math.min(MOUTH_COLS - 1, Math.max(0, smoothOpenY * (MOUTH_COLS - 1)));
      const col0 = Math.floor(colFloat);
      const col1 = Math.min(MOUTH_COLS - 1, col0 + 1);
      const fracCol = colFloat - col0;

      const rowFloat = Math.min(2, Math.max(0, smoothFormRow));
      const row0 = Math.floor(rowFloat);
      const row1 = Math.min(2, row0 + 1);
      const fracRow = rowFloat - row0;

      // 基準フレーム (col0, row0)
      offCtx.globalAlpha = 1.0;
      offCtx.drawImage(
        atlases.mouthAtlas,
        col0 * MOUTH_RECT.w,
        row0 * MOUTH_RECT.h,
        MOUTH_RECT.w,
        MOUTH_RECT.h,
        MOUTH_RECT.x,
        MOUTH_RECT.y,
        MOUTH_RECT.w,
        MOUTH_RECT.h
      );
      // 開度方向の連続補間 (col1, row0)
      if (fracCol > 0.01 && col1 !== col0) {
        offCtx.globalAlpha = fracCol;
        offCtx.drawImage(
          atlases.mouthAtlas,
          col1 * MOUTH_RECT.w,
          row0 * MOUTH_RECT.h,
          MOUTH_RECT.w,
          MOUTH_RECT.h,
          MOUTH_RECT.x,
          MOUTH_RECT.y,
          MOUTH_RECT.w,
          MOUTH_RECT.h
        );
      }
      // 母音横幅方向の連続補間 (row1)
      if (fracRow > 0.05 && row1 !== row0 && smoothOpenY > 0.08) {
        offCtx.globalAlpha = fracRow * 0.65;
        offCtx.drawImage(
          atlases.mouthAtlas,
          col0 * MOUTH_RECT.w,
          row1 * MOUTH_RECT.h,
          MOUTH_RECT.w,
          MOUTH_RECT.h,
          MOUTH_RECT.x,
          MOUTH_RECT.y,
          MOUTH_RECT.w,
          MOUTH_RECT.h
        );
      }
      offCtx.globalAlpha = 1.0;

      // --- (D) 頭部・首・上半身を独立制御する 2.5D ワープデフォーマ描画 ---
      // 非周期的な呼吸波と頭部揺らぎ
      const breathWave = Math.sin(t * 1.55) * 0.65 + Math.sin(t * 0.88 + 1.2) * 0.35;
      const swayWave = Math.sin(t * 0.95 + 0.5) * 0.6 + Math.cos(t * 1.62) * 0.4;

      // 会話中や相槌中の自然なうなずきターゲット
      const targetNod = isSpeakingLike
        ? (0.5 + 0.5 * Math.sin(t * 4.6)) * activeLevel * 5.2
        : curState === 'listening'
          ? Math.max(0, Math.sin(t * 2.8)) * 3.2
          : 0;
      smoothNodY += (targetNod - smoothNodY) * 0.12;

      const targetSwayX = swayWave * (isSpeakingLike ? 3.4 : 1.8);
      smoothHeadSwayX += (targetSwayX - smoothHeadSwayX) * 0.1;

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // 画面全体を高さ12pxの水平メッシュストリップに分割し、
      // 「頭部は滑らかにうなずき・揺れ、首で自然に繋がり、肩は呼吸し、ジャケット下端は固定される」
      // Live2Dワープデフォーマと同等の連続変形を適用
      const STRIP_H = 12;
      for (let y = 0; y < CANVAS_H; y += STRIP_H) {
        const h = Math.min(STRIP_H, CANVAS_H - y);
        const yMid = y + h * 0.5;

        // 頭部ウェイト: Y=0..430 は 1.0、Y=430..560（首〜襟元）でコサイン減衰、Y>560 は 0.0
        let wHead = 0;
        if (yMid <= 430) {
          wHead = 1.0;
        } else if (yMid < 560) {
          wHead = 0.5 * (1 + Math.cos(Math.PI * ((yMid - 430) / 130)));
        }

        // 胸部・肩の呼吸ウェイト: Y=480..880 で滑らかに膨らみ、下端 Y=935 では 0.0（完全固定）
        const bottomFactor = Math.max(0, Math.min(1, (CANVAS_H - yMid) / 480));
        const wBreath = Math.sin(bottomFactor * Math.PI * 0.85);

        // 頭頂に近いほど首振りによる水平変位が大きくなる（首の自然な傾き表現）
        const headLeverage = Math.max(0, (490 - yMid) / 380);
        const dx = smoothHeadSwayX * wHead * (0.45 + 0.55 * headLeverage);
        const dy = smoothNodY * wHead + breathWave * 2.2 * wBreath;

        // 呼吸に伴う肩〜胸元の微細な横幅伸縮（手がない新画像の中心 X=584 をカード中央 X=516 へ補正）
        const CENTER_SHIFT_X = -68;
        const scaleX = 1.0 + Math.max(0, breathWave) * 0.0035 * wBreath;
        const drawW = CANVAS_W * scaleX;
        const drawX = CENTER_SHIFT_X + dx - (drawW - CANVAS_W) * 0.5;

        // ストリップ間の隙間を防ぐため 0.6px オーバーラップ描画
        ctx.drawImage(
          offCanvas,
          0,
          y,
          CANVAS_W,
          h,
          drawX,
          y + dy,
          drawW,
          h + 0.6
        );
      }

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [atlasesReady]);

  const clampedLevel = Math.min(1, Math.max(0, audioLevel));
  const isSpeakingLike = state === 'speaking' || state === 'introducing_vehicle';
  const displayedVowel: MouthVowelShape =
    isSpeakingLike && clampedLevel > 0.06 ? vowel : 'closed';

  return (
    <section
      aria-label="ダイリン AI営業アシスタント"
      className="flex flex-col items-center bg-white rounded-2xl border border-blue-100 shadow-sm p-4 md:p-5 h-full justify-between"
    >
      {/* 上部ステータス */}
      <div className="w-full flex items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-blue-700">
            株式会社ジェイ・ピー
          </p>
          <h2 className="text-base md:text-lg font-bold text-slate-900">
            ダイリン AI営業アシスタント
          </h2>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs md:text-sm font-semibold border ${cfg.badgeClass}`}
        >
          <StatusIcon className="w-4 h-4 shrink-0" />
          <span>{cfg.label}</span>
        </div>
      </div>

      {/* キャラクター本体表示エリア（60fps無段階補間＆2.5DストリップデフォーマCanvas） */}
      <div
        className={`relative w-full max-w-[340px] md:max-w-[380px] aspect-[4/4.2] rounded-2xl overflow-hidden bg-gradient-to-b from-blue-50/70 via-white to-slate-50 border border-blue-100 ring-4 transition-all duration-300 ${cfg.ringClass} flex items-end justify-center`}
      >
        <img
          src="/images/dairin_ai_sales_character.png?v=2"
          alt="ダイリン AI営業アシスタント（女性営業キャラクター）"
          className={`w-full h-full object-contain object-bottom select-none pointer-events-none ${
            atlasesReady ? 'opacity-0 absolute inset-0' : 'opacity-100'
          }`}
          draggable={false}
        />

        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          aria-label="ダイリン AI営業キャラクター リアルタイムアニメーション"
          className={`w-full h-full object-contain object-bottom select-none pointer-events-none ${
            atlasesReady ? 'opacity-100' : 'opacity-0 absolute inset-0'
          }`}
        />

        {/* 音声同期・母音リップシンクインジケータ */}
        {isSpeakingLike && (
          <div
            aria-hidden="true"
            className="absolute bottom-3 right-3 flex items-center gap-2 bg-white/90 backdrop-blur-sm px-2.5 py-1.5 rounded-full border border-blue-200 shadow-sm"
          >
            <span className="text-[11px] font-bold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded">
              口形: {VOWEL_LABELS[displayedVowel]}
            </span>
            <div className="flex items-end gap-1">
              {[0.4, 0.85, 0.6, 1.0, 0.5].map((mult, idx) => {
                const barHeight = Math.max(4, Math.round(4 + clampedLevel * 14 * mult));
                return (
                  <span
                    key={idx}
                    className="w-1 rounded-full bg-blue-600 transition-all duration-75"
                    style={{ height: `${barHeight}px` }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* 聞き取り中インジケータ */}
        {state === 'listening' && (
          <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-emerald-600 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-sm">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>音声を聞き取り中</span>
          </div>
        )}

        {/* 思考中インジケータ */}
        {state === 'thinking' && (
          <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-amber-500 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-sm">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            <span>ご案内を準備中…</span>
          </div>
        )}
      </div>

      {/* 下部字幕 / 状態案内 / 音声・リップシンク動作テストボタン */}
      <div className="w-full mt-3 space-y-2">
        {subtitle ? (
          <div className="bg-blue-50/80 border border-blue-100 rounded-xl px-3.5 py-2.5 text-sm md:text-base text-slate-800 leading-relaxed min-h-[3.25rem]">
            {subtitle}
          </div>
        ) : (
          <p className="text-center text-xs md:text-sm text-slate-500 py-2">
            {cfg.subLabel}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {onPlayTestGreeting && (
            <button
              type="button"
              onClick={onPlayTestGreeting}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2 px-3 text-xs font-bold transition-colors cursor-pointer shadow-2xs"
            >
              <MessageSquareHeart className="w-4 h-4 shrink-0" />
              <span>営業挨拶セリフで口パク確認</span>
            </button>
          )}
          {onPlaySampleVoice && (
            <button
              type="button"
              onClick={onPlaySampleVoice}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl py-2 px-3 text-xs font-bold transition-colors cursor-pointer"
            >
              <Volume2 className="w-4 h-4 text-blue-700 shrink-0" />
              <span>指定ボイスサンプル再生</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
