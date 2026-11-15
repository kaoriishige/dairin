import React, { useEffect, useRef, useState } from 'react';
import { Mic, Sparkles, Volume2, Car, Clock } from 'lucide-react';
import type { CharacterState } from '../../types';
import type {
  FemaleVoiceChoice,
  LiveVoiceMetrics,
  MouthVowelShape,
} from '../../services/audio/elevenLabsPlayer';

export interface SalesCharacterProps {
  state: CharacterState;
  audioLevel?: number;
  vowel?: MouthVowelShape;
  getLiveVoiceMetrics?: () => LiveVoiceMetrics;
  voiceChoice?: FemaleVoiceChoice;
  onChangeVoiceChoice?: (choice: FemaleVoiceChoice) => void;
  subtitle?: string;
}

const STATE_CONFIG: Record<
  CharacterState,
  { label: string; subLabel: string; badgeClass: string; ringClass: string; Icon: React.ElementType }
> = {
  idle: {
    label: '待機中',
    subLabel: '下の「会話を始める」からご相談ください',
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
  voiceChoice = 'fn6Wir86vS59qP6PheHG',
  onChangeVoiceChoice,
  subtitle,
}) => {
  const cfg = STATE_CONFIG[state];
  const StatusIcon = cfg.Icon;

  const idleVideoRef = useRef<HTMLVideoElement | null>(null);
  const speakingVideoRef = useRef<HTMLVideoElement | null>(null);
  const [idleVideoReady, setIdleVideoReady] = useState(false);
  const [speakingVideoReady, setSpeakingVideoReady] = useState(false);

  const isSpeakingLike = state === 'speaking' || state === 'introducing_vehicle';
  const clampedLevel = Math.min(1, Math.max(0, audioLevel));

  // iOS Safari / Android Chrome 向けに video 要素の muted / playsInline 属性を確実に適用
  useEffect(() => {
    const setupMobileVideo = (vid: HTMLVideoElement | null) => {
      if (!vid) return;
      vid.muted = true;
      vid.defaultMuted = true;
      vid.playsInline = true;
      vid.setAttribute('muted', '');
      vid.setAttribute('playsinline', '');
      vid.setAttribute('webkit-playsinline', '');
    };

    setupMobileVideo(idleVideoRef.current);
    setupMobileVideo(speakingVideoRef.current);

    idleVideoRef.current?.play().catch(() => {});

    const unlockOnTouch = () => {
      if (idleVideoRef.current && idleVideoRef.current.paused) {
        idleVideoRef.current.play().catch(() => {});
      }
    };
    window.addEventListener('touchstart', unlockOnTouch, { passive: true });
    window.addEventListener('click', unlockOnTouch, { passive: true });
    return () => {
      window.removeEventListener('touchstart', unlockOnTouch);
      window.removeEventListener('click', unlockOnTouch);
    };
  }, []);

  // 状態に応じて待機動画(MP4)と発話動画(MP4)をシームレスに切り替え
  useEffect(() => {
    const idleVid = idleVideoRef.current;
    const speakVid = speakingVideoRef.current;

    if (idleVid && idleVid.paused) {
      idleVid.play().catch(() => {});
    }

    if (speakVid) {
      if (isSpeakingLike) {
        speakVid.muted = true;
        speakVid.play().catch(() => {});
      } else {
        speakVid.pause();
        try {
          speakVid.currentTime = 0;
        } catch {
          // ignore if not seekable yet
        }
      }
    }
  }, [isSpeakingLike]);

  return (
    <section
      aria-label="ダイリン AI営業アシスタント"
      className="flex flex-col items-center bg-white rounded-2xl border border-blue-100 shadow-sm p-3 sm:p-4"
    >
      {/* 上部ステータス */}
      <div className="w-full flex items-center justify-between gap-2 mb-2">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-blue-700">
            株式会社ジェイ・ピー
          </p>
          <h2 className="text-sm sm:text-base font-bold text-slate-900">
            ダイリン AI営業アシスタント
          </h2>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.badgeClass}`}
        >
          <StatusIcon className="w-3.5 h-3.5 shrink-0" />
          <span>{cfg.label}</span>
        </div>
      </div>

      {/* キャラクター本体表示エリア（右上または右下に小さな声選択プルダウンのみ配置） */}
      <div
        className={`relative w-full max-w-[240px] sm:max-w-[300px] md:max-w-[360px] aspect-[4/4.1] rounded-2xl overflow-hidden bg-white border border-blue-100 ring-4 transition-all duration-300 ${cfg.ringClass}`}
      >
        {/* ベース静止画 */}
        <img
          src="/images/dairin_ai_sales_character.png?v=4"
          alt="ダイリン AI営業アシスタント（女性営業キャラクター）"
          className="absolute inset-0 w-full h-full object-contain object-bottom select-none pointer-events-none"
          draggable={false}
        />

        {/* ① 待機・聞き取り中ループ動画 */}
        <video
          ref={idleVideoRef}
          src="/videos/character_idle.mp4?v=4"
          poster="/images/dairin_ai_sales_character.png?v=4"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onCanPlay={() => setIdleVideoReady(true)}
          onPlaying={() => setIdleVideoReady(true)}
          aria-label="ダイリン AI営業キャラクター 待機アニメーション動画"
          className={`absolute inset-0 w-full h-full object-contain object-bottom select-none pointer-events-none transition-opacity duration-200 ${
            idleVideoReady && !isSpeakingLike ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* ② 発話・車両紹介中ループ動画 */}
        <video
          ref={speakingVideoRef}
          src="/videos/character_speaking.mp4?v=6"
          poster="/images/dairin_ai_sales_character.png?v=4"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onCanPlay={() => setSpeakingVideoReady(true)}
          onPlaying={() => setSpeakingVideoReady(true)}
          aria-label="ダイリン AI営業キャラクター 会話アニメーション動画"
          className={`absolute inset-0 w-full h-full object-contain object-bottom select-none pointer-events-none transition-opacity duration-150 ${
            speakingVideoReady && isSpeakingLike ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* キャラクター枠右上の小さな声切り替えプルダウン */}
        {onChangeVoiceChoice && (
          <div className="absolute top-2 right-2 z-10">
            <select
              id="female-voice-select"
              aria-label="女性の声を選択"
              value={voiceChoice}
              onChange={(e) => onChangeVoiceChoice(e.target.value as FemaleVoiceChoice)}
              className="rounded-lg border border-blue-200/90 bg-white/90 backdrop-blur-xs px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="fn6Wir86vS59qP6PheHG">声①（標準）</option>
              <option value="U4eWfk1iaCTV9hveteMg">声②</option>
              <option value="tmmztcupA9Eu81ix80hq">声③</option>
            </select>
          </div>
        )}

        {/* 発話中インジケータ */}
        {isSpeakingLike && (
          <div
            aria-hidden="true"
            className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-full border border-blue-200 shadow-xs z-10"
          >
            <span className="text-[11px] font-bold text-blue-800">会話中</span>
            <div className="flex items-end gap-0.5">
              {[0.4, 0.85, 0.6, 1.0, 0.5].map((mult, idx) => {
                const barHeight = Math.max(4, Math.round(4 + Math.max(0.35, clampedLevel) * 11 * mult));
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
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-emerald-600 text-white px-2.5 py-1 rounded-full text-xs font-semibold shadow-xs z-10">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>音声を聞き取り中</span>
          </div>
        )}

        {/* 思考中インジケータ */}
        {state === 'thinking' && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-amber-500 text-white px-2.5 py-1 rounded-full text-xs font-semibold shadow-xs z-10">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            <span>ご案内を準備中…</span>
          </div>
        )}
      </div>

      {/* 下部字幕（会話中のみコンパクトに表示） */}
      {subtitle && (
        <div className="w-full mt-2 bg-blue-50/80 border border-blue-100 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-800 leading-relaxed">
          {subtitle}
        </div>
      )}
    </section>
  );
};
