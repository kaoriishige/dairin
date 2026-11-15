import React, { useEffect, useRef, useState } from 'react';
import { Mic, Sparkles, Volume2, Car, Clock, MessageSquareHeart } from 'lucide-react';
import type { CharacterState } from '../../types';
import type { MouthVowelShape } from '../../services/audio/elevenLabsPlayer';

export interface SalesCharacterProps {
  state: CharacterState;
  audioLevel?: number; // 0.0 - 1.0 音声エネルギー
  vowel?: MouthVowelShape; // フォルマント解析による日本語母音 ('closed' | 'a' | 'i' | 'u' | 'e' | 'o')
  subtitle?: string;
  onPlaySampleVoice?: () => void;
  onPlayTestGreeting?: () => void;
  rendererMode?: 'canvas_25d_lipsync' | 'live2d_cubism';
}

type EyeBlinkState = 'open' | 'half' | 'closed';

const CANVAS_W = 1024;
const CANVAS_H = 935;

// 元画像 (1024x935) から抽出した目・口パーツの精密座標
const EYE_RECT = { x: 435, y: 245, w: 255, h: 88 };
const MOUTH_RECT = { x: 520, y: 360, w: 132, h: 76 };
// 頭部・首の付け根ピボット座標（自然なうなずき・首の傾き用）
const NECK_PIVOT = { x: 560, y: 465 };

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

interface LoadedSprites {
  base: HTMLImageElement;
  eyes: Record<EyeBlinkState, HTMLImageElement>;
  mouths: Record<MouthVowelShape, HTMLImageElement>;
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

export const SalesCharacter: React.FC<SalesCharacterProps> = ({
  state,
  audioLevel = 0,
  vowel = 'closed',
  subtitle,
  onPlaySampleVoice,
  onPlayTestGreeting,
}) => {
  const cfg = STATE_CONFIG[state];
  const StatusIcon = cfg.Icon;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spritesRef = useRef<LoadedSprites | null>(null);
  const [spritesReady, setSpritesReady] = useState(false);

  // 最新propsをアニメーションループ内で参照するためのref
  const stateRef = useRef<CharacterState>(state);
  const levelRef = useRef<number>(audioLevel);
  const vowelRef = useRef<MouthVowelShape>(vowel);
  const eyeStateRef = useRef<EyeBlinkState>('open');
  const smoothedVowelRef = useRef<{ shape: MouthVowelShape; lastChangedAt: number }>({
    shape: 'closed',
    lastChangedAt: 0,
  });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    levelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    vowelRef.current = vowel;
  }, [vowel]);

  // 1. ベース画像および目（3種）・母音別口（6種）パーツのプリロード
  useEffect(() => {
    let cancelled = false;

    async function preloadAll() {
      try {
        const [
          base,
          eyeOpen,
          eyeHalf,
          eyeClosed,
          mouthClosed,
          mouthA,
          mouthI,
          mouthU,
          mouthE,
          mouthO,
        ] = await Promise.all([
          loadImage('/images/dairin_ai_sales_character.png'),
          loadImage('/images/parts/eyes_open.png'),
          loadImage('/images/parts/eyes_half.png'),
          loadImage('/images/parts/eyes_closed.png'),
          loadImage('/images/parts/mouth_closed.png'),
          loadImage('/images/parts/mouth_a.png'),
          loadImage('/images/parts/mouth_i.png'),
          loadImage('/images/parts/mouth_u.png'),
          loadImage('/images/parts/mouth_e.png'),
          loadImage('/images/parts/mouth_o.png'),
        ]);

        if (cancelled) return;
        spritesRef.current = {
          base,
          eyes: {
            open: eyeOpen,
            half: eyeHalf,
            closed: eyeClosed,
          },
          mouths: {
            closed: mouthClosed,
            a: mouthA,
            i: mouthI,
            u: mouthU,
            e: mouthE,
            o: mouthO,
          },
        };
        setSpritesReady(true);
      } catch {
        // テスト環境や画像未ロード時はフォールバック<img>を表示
      }
    }

    void preloadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. 不規則で自然なまばたきスケジューラ（機械的な一定周期ではなくランダム間隔＋時々2回まばたき）
  useEffect(() => {
    let timerId: number | undefined;
    let subTimers: number[] = [];
    let active = true;

    const clearSubTimers = () => {
      subTimers.forEach((id) => window.clearTimeout(id));
      subTimers = [];
    };

    const triggerBlinkSequence = (isDoubleBlink: boolean) => {
      if (!active) return;
      // 1回目のまばたき: open -> half(45ms) -> closed(65ms) -> half(45ms) -> open
      eyeStateRef.current = 'half';
      subTimers.push(
        window.setTimeout(() => {
          if (!active) return;
          eyeStateRef.current = 'closed';
        }, 45)
      );
      subTimers.push(
        window.setTimeout(() => {
          if (!active) return;
          eyeStateRef.current = 'half';
        }, 110)
      );
      subTimers.push(
        window.setTimeout(() => {
          if (!active) return;
          eyeStateRef.current = 'open';
        }, 155)
      );

      if (isDoubleBlink) {
        subTimers.push(
          window.setTimeout(() => {
            if (!active) return;
            eyeStateRef.current = 'half';
          }, 290)
        );
        subTimers.push(
          window.setTimeout(() => {
            if (!active) return;
            eyeStateRef.current = 'closed';
          }, 330)
        );
        subTimers.push(
          window.setTimeout(() => {
            if (!active) return;
            eyeStateRef.current = 'half';
          }, 390)
        );
        subTimers.push(
          window.setTimeout(() => {
            if (!active) return;
            eyeStateRef.current = 'open';
          }, 435)
        );
      }
    };

    const scheduleNextBlink = () => {
      if (!active) return;
      // 2.2秒〜5.6秒の不規則な間隔
      const nextDelay = 2200 + Math.random() * 3400;
      timerId = window.setTimeout(() => {
        if (!active) return;
        clearSubTimers();
        const isDouble = Math.random() < 0.22;
        triggerBlinkSequence(isDouble);
        scheduleNextBlink();
      }, nextDelay);
    };

    scheduleNextBlink();
    return () => {
      active = false;
      if (timerId !== undefined) window.clearTimeout(timerId);
      clearSubTimers();
    };
  }, []);

  // 3. 60fps Canvas アニメーションレンダラー（呼吸・首の揺らぎ・うなずき・まばたき・母音リップシンク）
  useEffect(() => {
    if (!spritesReady || !spritesRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const startTime = performance.now();

    const renderFrame = (now: number) => {
      const sprites = spritesRef.current;
      if (!sprites) return;

      const t = (now - startTime) / 1000;
      const curState = stateRef.current;
      const curLevel = Math.min(1, Math.max(0, levelRef.current));
      const rawVowel = vowelRef.current;
      const isSpeakingLike = curState === 'speaking' || curState === 'introducing_vehicle';

      // --- (A) 口形状（母音リップシンク＆音声停止時の確実な閉口） ---
      let targetMouth: MouthVowelShape = 'closed';
      if (isSpeakingLike && curLevel > 0.065) {
        if (rawVowel !== 'closed') {
          targetMouth = rawVowel;
        } else {
          // 音量に応じて自然な母音へフォールバック
          targetMouth = curLevel > 0.38 ? 'a' : curLevel > 0.2 ? 'e' : 'u';
        }
      } else {
        // 音声が停止した・無音区間のときは即座に口を閉じる
        targetMouth = 'closed';
      }

      // 発話中の口形状が1フレームごとにパタパタしすぎないよう48msの最小保持時間を適用（ただし閉口時は即座に反映）
      if (targetMouth === 'closed') {
        smoothedVowelRef.current = { shape: 'closed', lastChangedAt: now };
      } else if (
        smoothedVowelRef.current.shape === 'closed' ||
        now - smoothedVowelRef.current.lastChangedAt >= 48
      ) {
        smoothedVowelRef.current = { shape: targetMouth, lastChangedAt: now };
      }
      const activeMouthShape = smoothedVowelRef.current.shape;

      // --- (B) 非周期的な呼吸・うなずき・首の自然な微細モーション計算 ---
      // 複数の互いに素な周波数を合成し、機械的な反復を排除
      const breathWave =
        Math.sin(t * 1.45) * 0.65 + Math.sin(t * 0.85 + 1.1) * 0.35; // -1..1
      const microSwayWave =
        Math.sin(t * 0.92 + 0.4) * 0.6 + Math.cos(t * 1.63) * 0.4; // -1..1

      // 会話中や相槌（listening）時の軽いうなずき波
      const nodPulse = isSpeakingLike
        ? (Math.sin(t * 4.2) * 0.5 + Math.sin(t * 6.7) * 0.5) * curLevel
        : curState === 'listening'
          ? Math.max(0, Math.sin(t * 2.6)) * 0.45
          : 0;

      // 上半身の呼吸による小さな上下動 (px)
      const bodyOffsetY = breathWave * 2.4 + nodPulse * 3.2;
      // 自然な左右の微細重心移動 (px)
      const bodyOffsetX = microSwayWave * (isSpeakingLike ? 1.8 : 1.0);
      // 首・頭部の微細な傾き（ラジアン: 最大約 ±0.7度 で顔や制服が歪まない範囲）
      const subtleAngleRad =
        (microSwayWave * (isSpeakingLike ? 0.55 : 0.28) +
          (curState === 'listening' ? 0.35 : 0)) *
        (Math.PI / 180);

      // --- (C) Canvas描画 ---
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.save();

      // 首元ピボットを中心に微細な傾きと呼吸オフセットを適用
      ctx.translate(NECK_PIVOT.x + bodyOffsetX, NECK_PIVOT.y + bodyOffsetY);
      ctx.rotate(subtleAngleRad);
      ctx.translate(-NECK_PIVOT.x, -NECK_PIVOT.y);

      // 1. ベースキャラクター描画（顔・髪型・制服・スカーフ・名札を完全維持）
      ctx.drawImage(sprites.base, 0, 0, CANVAS_W, CANVAS_H);

      // 2. 目パーツ描画（自然まばたき、または説明中・笑顔のやわらかい目元）
      let currentEyeState: EyeBlinkState = eyeStateRef.current;
      // 会話の盛り上がり時にごくまれに優しい細め目（笑顔感）をブレンド
      if (currentEyeState === 'open' && isSpeakingLike && curLevel > 0.72 && Math.sin(t * 3.1) > 0.82) {
        currentEyeState = 'half';
      }
      if (currentEyeState !== 'open') {
        const eyeImg = sprites.eyes[currentEyeState];
        ctx.drawImage(eyeImg, EYE_RECT.x, EYE_RECT.y, EYE_RECT.w, EYE_RECT.h);
      }

      // 3. 口パーツ描画（母音 a/i/u/e/o または 閉じた微笑み口 closed）
      const mouthImg = sprites.mouths[activeMouthShape] || sprites.mouths.closed;
      ctx.drawImage(mouthImg, MOUTH_RECT.x, MOUTH_RECT.y, MOUTH_RECT.w, MOUTH_RECT.h);

      ctx.restore();

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [spritesReady]);

  const clampedLevel = Math.min(1, Math.max(0, audioLevel));
  const isSpeakingLike = state === 'speaking' || state === 'introducing_vehicle';
  const displayedVowel: MouthVowelShape =
    isSpeakingLike && clampedLevel > 0.065 ? vowel : 'closed';

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

      {/* キャラクター本体表示エリア（60fps母音リップシンク＆自然まばたきCanvas + フォールバックimg） */}
      <div
        className={`relative w-full max-w-[340px] md:max-w-[380px] aspect-[4/4.2] rounded-2xl overflow-hidden bg-gradient-to-b from-blue-50/70 via-white to-slate-50 border border-blue-100 ring-4 transition-all duration-300 ${cfg.ringClass} flex items-end justify-center`}
      >
        {/* プリロード完了前およびテスト用の原画フォールバック */}
        <img
          src="/images/dairin_ai_sales_character.png"
          alt="ダイリン AI営業アシスタント（女性営業キャラクター）"
          className={`w-full h-full object-contain object-bottom select-none pointer-events-none ${
            spritesReady ? 'opacity-0 absolute inset-0' : 'opacity-100'
          }`}
          draggable={false}
        />

        {/* リアルタイム母音リップシンク・自然まばたき・呼吸・うなずき描画Canvas */}
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          aria-label="ダイリン AI営業キャラクター リアルタイムアニメーション"
          className={`w-full h-full object-contain object-bottom select-none pointer-events-none ${
            spritesReady ? 'opacity-100' : 'opacity-0 absolute inset-0'
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
