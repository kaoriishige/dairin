import React from 'react';
import { Mic, Sparkles, Volume2, Car, Clock } from 'lucide-react';
import type { CharacterState } from '../../types';

export interface SalesCharacterProps {
  state: CharacterState;
  audioLevel?: number; // 0.0 - 1.0 音声レベルに応じた微細な反応用
  subtitle?: string;
  rendererMode?: 'png_static_motion'; // 将来の 'live2d' / 'lip_sync' 拡張用スロット
}

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

export const SalesCharacter: React.FC<SalesCharacterProps> = ({
  state,
  audioLevel = 0,
  subtitle,
}) => {
  const cfg = STATE_CONFIG[state];
  const StatusIcon = cfg.Icon;

  // 音声レベルに応じたごく自然な上下動（顔や体型を変形させない）
  const clampedLevel = Math.min(1, Math.max(0, audioLevel));
  const isSpeakingLike = state === 'speaking' || state === 'introducing_vehicle';
  const dynamicTranslateY = isSpeakingLike ? -(clampedLevel * 4) : 0;

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

      {/* キャラクター本体表示エリア */}
      <div
        className={`relative w-full max-w-[340px] md:max-w-[380px] aspect-[4/4.2] rounded-2xl overflow-hidden bg-gradient-to-b from-blue-50/70 via-white to-slate-50 border border-blue-100 ring-4 transition-all duration-300 ${cfg.ringClass} flex items-end justify-center`}
      >
        <div
          className={`w-full h-full flex items-end justify-center transition-transform duration-150 ${
            state === 'idle' ? 'animate-gentle-float' : ''
          }`}
          style={{
            transform: isSpeakingLike ? `translateY(${dynamicTranslateY.toFixed(1)}px)` : undefined,
          }}
        >
          <img
            src="/images/dairin_ai_sales_character.png"
            alt="ダイリン AI営業アシスタント（女性営業キャラクター）"
            className="w-full h-full object-contain object-bottom select-none pointer-events-none"
            draggable={false}
          />
        </div>

        {/* 音声レベルインジケータ（口パク未実装のため視覚的音声ゲージで発話状態を明示） */}
        {isSpeakingLike && (
          <div
            aria-hidden="true"
            className="absolute bottom-3 right-3 flex items-end gap-1 bg-white/90 backdrop-blur-sm px-2.5 py-1.5 rounded-full border border-blue-200 shadow-sm"
          >
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

      {/* 下部字幕 / 状態案内 */}
      <div className="w-full mt-3">
        {subtitle ? (
          <div className="bg-blue-50/80 border border-blue-100 rounded-xl px-3.5 py-2.5 text-sm md:text-base text-slate-800 leading-relaxed min-h-[3.25rem]">
            {subtitle}
          </div>
        ) : (
          <p className="text-center text-xs md:text-sm text-slate-500 py-2">
            {cfg.subLabel}
          </p>
        )}
      </div>
    </section>
  );
};
