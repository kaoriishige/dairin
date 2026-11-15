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
  isSpeaking?: boolean;
  audioLevel?: number;
  vowel?: MouthVowelShape;
  getLiveVoiceMetrics?: () => LiveVoiceMetrics;
  voiceChoice?: FemaleVoiceChoice;
  onChangeVoiceChoice?: (choice: FemaleVoiceChoice) => void;
  subtitle?: string;
  interimTranscript?: string;
}

const STATE_CONFIG: Record<
  CharacterState,
  { label: string; subLabel: string; badgeClass: string; ringClass: string; Icon: React.ElementType }
> = {
  idle: {
    label: '待機中',
    subLabel: '下のボタンからいつでも話しかけてください',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    ringClass: 'ring-blue-100',
    Icon: Clock,
  },
  listening: {
    label: 'お話を伺っています',
    subLabel: 'スマホ・PCに向かってそのままお話しください',
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
  isSpeaking = false,
  audioLevel = 0,
  voiceChoice = 'ja-JP-Chirp3-HD-Leda',
  onChangeVoiceChoice,
  subtitle,
  interimTranscript,
}) => {
  // 音声再生が終了しているのに speaking 表示が残らないよう厳密に判定
  const effectiveState: CharacterState =
    !isSpeaking && (state === 'speaking' || state === 'introducing_vehicle') ? 'idle' : state;
  const cfg = STATE_CONFIG[effectiveState];
  const StatusIcon = cfg.Icon;

  const idleVideoRef = useRef<HTMLVideoElement | null>(null);
  const speakingVideoRef = useRef<HTMLVideoElement | null>(null);
  const [idleVideoReady, setIdleVideoReady] = useState(false);
  const [speakingVideoReady, setSpeakingVideoReady] = useState(false);

  // 口パク動画は実際に音声が再生中（isSpeaking === true）の間だけ再生・表示する
  const activeSpeaking = Boolean(isSpeaking);
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

  // 音声再生状態（activeSpeaking）に応じて待機動画(MP4)と発話動画(MP4)を厳密に切り替え
  useEffect(() => {
    const idleVid = idleVideoRef.current;
    const speakVid = speakingVideoRef.current;

    if (idleVid && idleVid.paused) {
      idleVid.play().catch(() => {});
    }

    if (speakVid) {
      if (activeSpeaking) {
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
  }, [activeSpeaking]);

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

      {/* キャラクター本体表示エリア */}
      <div
        className={`relative w-full max-w-[230px] sm:max-w-[290px] md:max-w-[350px] aspect-[4/4.1] rounded-2xl overflow-hidden bg-white border border-blue-100 ring-4 transition-all duration-300 ${cfg.ringClass}`}
      >
        {/* ベース静止画（口を閉じた正面画像） */}
        <img
          src="/images/dairin_ai_sales_character.png?v=4"
          alt="ダイリン AI営業アシスタント（女性営業キャラクター）"
          className="absolute inset-0 w-full h-full object-contain object-bottom select-none pointer-events-none"
          draggable={false}
        />

        {/* ① 待機・聞き取り中ループ動画（口を閉じてまばたき・呼吸） */}
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
          className={`absolute inset-0 w-full h-full object-contain object-bottom select-none pointer-events-none transition-opacity duration-150 ${
            idleVideoReady && !activeSpeaking ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* ② 発話中ループ動画（音声が流れている間だけ口を開閉） */}
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
            speakingVideoReady && activeSpeaking ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* 発話中インジケータ */}
        {activeSpeaking && (
          <div
            aria-hidden="true"
            className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-full border border-blue-200 shadow-xs z-10"
          >
            <span className="text-[11px] font-bold text-blue-800">お話中</span>
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
        {effectiveState === 'listening' && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-emerald-600 text-white px-2.5 py-1 rounded-full text-xs font-semibold shadow-xs z-10">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>あなたのお話を聞いています…</span>
          </div>
        )}

        {/* 思考中インジケータ */}
        {effectiveState === 'thinking' && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-amber-500 text-white px-2.5 py-1 rounded-full text-xs font-semibold shadow-xs z-10">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            <span>ご案内を準備中…</span>
          </div>
        )}
      </div>

      {/* 聞き取り中のリアルタイム音声認識プレビュー */}
      {interimTranscript && (
        <div className="w-full mt-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-emerald-900 font-medium">
          🎤 「{interimTranscript}」
        </div>
      )}

      {/* キャラクターの現在のセリフ吹き出し（目の前で会話している感覚を強める） */}
      {subtitle && (
        <div className="w-full mt-2 bg-blue-50/90 border border-blue-200 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-slate-900 leading-relaxed whitespace-pre-wrap shadow-2xs">
          {subtitle}
        </div>
      )}

      {/* キャラクター画像の外側（下）に可愛い声の切り替えプルダウンを配置 */}
      {onChangeVoiceChoice && (
        <div className="w-full mt-2 flex items-center justify-end gap-1.5">
          <label htmlFor="female-voice-select" className="text-[11px] font-semibold text-slate-500">
            女性の声：
          </label>
          <select
            id="female-voice-select"
            aria-label="女性の声を選択"
            value={voiceChoice}
            onChange={(e) => onChangeVoiceChoice(e.target.value as FemaleVoiceChoice)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="ja-JP-Chirp3-HD-Leda">① 可愛い・若々しい（Leda HD）</option>
            <option value="ja-JP-Chirp3-HD-Zephyr">② 明るく元気・可愛い（Zephyr HD）</option>
            <option value="ja-JP-Wavenet-A-cute">③ 高め・アニメ調（Wavenet-A）</option>
            <option value="ja-JP-Neural2-B-cute">④ 高め・受付調（Neural2-B）</option>
          </select>
        </div>
      )}
    </section>
  );
};
