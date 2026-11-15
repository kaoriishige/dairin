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
  onPlaySampleVoice,
  onPlayTestGreeting,
}) => {
  const cfg = STATE_CONFIG[state];
  const StatusIcon = cfg.Icon;

  const idleVideoRef = useRef<HTMLVideoElement | null>(null);
  const speakingVideoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  const isSpeakingLike = state === 'speaking' || state === 'introducing_vehicle';
  const clampedLevel = Math.min(1, Math.max(0, audioLevel));

  // 状態に応じて待機動画(MP4)と発話動画(MP4)をシームレスに再生・切り替え
  useEffect(() => {
    const idleVid = idleVideoRef.current;
    const speakVid = speakingVideoRef.current;

    if (idleVid && idleVid.paused) {
      idleVid.play().catch(() => {
        // 自動再生ポリシー制限時はユーザー操作後に再生
      });
    }

    if (speakVid) {
      if (isSpeakingLike) {
        speakVid.play().catch(() => {});
      } else {
        speakVid.pause();
        speakVid.currentTime = 0;
      }
    }
  }, [isSpeakingLike]);

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

      {/* キャラクター本体表示エリア（待機動画MP4 ⇔ 発話動画MP4 シームレス切り替え） */}
      <div
        className={`relative w-full max-w-[340px] md:max-w-[380px] aspect-[4/4.2] rounded-2xl overflow-hidden bg-white border border-blue-100 ring-4 transition-all duration-300 ${cfg.ringClass} flex items-end justify-center`}
      >
        {/* 動画ロード前フォールバック静止画 */}
        <img
          src="/images/dairin_ai_sales_character.png?v=2"
          alt="ダイリン AI営業アシスタント（女性営業キャラクター）"
          className={`w-full h-full object-contain object-bottom select-none pointer-events-none transition-opacity duration-200 ${
            videoReady ? 'opacity-0 absolute inset-0' : 'opacity-100'
          }`}
          draggable={false}
        />

        {/* ① 待機・聞き取り中ループ動画 (character_idle.mp4) */}
        <video
          ref={idleVideoRef}
          src="/videos/character_idle.mp4?v=1"
          poster="/images/dairin_ai_sales_character.png?v=2"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onLoadedData={() => setVideoReady(true)}
          aria-label="ダイリン AI営業キャラクター 待機アニメーション動画"
          className={`w-full h-full object-contain object-bottom select-none pointer-events-none transition-opacity duration-200 ${
            isSpeakingLike ? 'opacity-0' : 'opacity-100'
          }`}
        />

        {/* ② 発話・車両紹介中ループ動画 (character_speaking.mp4) */}
        <video
          ref={speakingVideoRef}
          src="/videos/character_speaking.mp4?v=1"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-label="ダイリン AI営業キャラクター 会話アニメーション動画"
          className={`absolute inset-0 w-full h-full object-contain object-bottom select-none pointer-events-none transition-opacity duration-150 ${
            isSpeakingLike ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* 発話中インジケータ（OpenAI音声再生中） */}
        {isSpeakingLike && (
          <div
            aria-hidden="true"
            className="absolute bottom-3 right-3 flex items-center gap-2 bg-white/90 backdrop-blur-sm px-2.5 py-1.5 rounded-full border border-blue-200 shadow-sm"
          >
            <span className="text-[11px] font-bold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded">
              OpenAI音声で会話中
            </span>
            <div className="flex items-end gap-1">
              {[0.4, 0.85, 0.6, 1.0, 0.5].map((mult, idx) => {
                const barHeight = Math.max(5, Math.round(5 + Math.max(0.35, clampedLevel) * 13 * mult));
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

      {/* 下部字幕 / 状態案内 / 音声・動画テストボタン */}
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
              <span>営業挨拶セリフを再生</span>
            </button>
          )}
          {onPlaySampleVoice && (
            <button
              type="button"
              onClick={onPlaySampleVoice}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl py-2 px-3 text-xs font-bold transition-colors cursor-pointer"
            >
              <Volume2 className="w-4 h-4 text-blue-700 shrink-0" />
              <span>OpenAIボイスサンプル再生</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
