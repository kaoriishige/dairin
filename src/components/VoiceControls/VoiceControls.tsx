import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Play,
  Square,
  RotateCcw,
  Volume2,
  VolumeX,
  Send,
  Subtitles,
  PhoneOff,
} from 'lucide-react';

interface VoiceControlsProps {
  sessionStarted: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
  speechSupported: boolean;
  ttsEnabled: boolean;
  volume: number;
  showSubtitle: boolean;
  onStartSession: () => void;
  onEndSession: () => void;
  onResetSession: () => void;
  onToggleMic: () => void;
  onStopSpeaking: () => void;
  onChangeVolume: (vol: number) => void;
  onToggleSubtitle: () => void;
  onSendText: (text: string) => void;
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  sessionStarted,
  isListening,
  isSpeaking,
  isThinking,
  speechSupported,
  ttsEnabled,
  volume,
  showSubtitle,
  onStartSession,
  onEndSession,
  onResetSession,
  onToggleMic,
  onStopSpeaking,
  onChangeVolume,
  onToggleSubtitle,
  onSendText,
}) => {
  const [inputText, setInputText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isThinking) return;
    onSendText(trimmed);
    setInputText('');
  };

  if (!sessionStarted) {
    return (
      <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-sm text-slate-700">
          <p className="font-bold text-slate-900">AI営業アシスタントと会話を始めましょう</p>
          <p className="text-xs text-slate-500 mt-0.5">
            「会話を始める」を押すと、女性営業キャラクターが音声でご挨拶します（文字チャットもご利用いただけます）。
          </p>
        </div>
        <button
          type="button"
          onClick={onStartSession}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white font-bold text-base px-6 py-3.5 rounded-xl shadow-sm transition-colors cursor-pointer shrink-0"
        >
          <Play className="w-5 h-5 fill-current" />
          会話を始める
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-blue-200 p-3 md:p-4 shadow-sm space-y-3">
      {/* 操作ボタン行 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* 大きいマイクボタン */}
          <button
            type="button"
            onClick={onToggleMic}
            disabled={!speechSupported || isThinking}
            className={`inline-flex items-center gap-2 font-bold text-sm md:text-base px-5 py-3 rounded-xl shadow-sm transition-colors cursor-pointer disabled:opacity-50 ${
              isListening
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-4 ring-emerald-200'
                : 'bg-blue-700 hover:bg-blue-800 text-white'
            }`}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            <span>
              {isListening
                ? '聞き取り停止'
                : isSpeaking
                ? '話しかけて割り込む'
                : 'マイクで話す'}
            </span>
          </button>

          {/* AI音声停止 */}
          {isSpeaking && (
            <button
              type="button"
              onClick={onStopSpeaking}
              className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm px-4 py-3 rounded-xl shadow-xs cursor-pointer"
            >
              <Square className="w-4 h-4 fill-current" />
              音声を止める
            </button>
          )}
        </div>

        {/* 補助コントロール：音量・字幕・リセット・終了 */}
        <div className="flex flex-wrap items-center gap-2">
          {ttsEnabled && (
            <label className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
              {volume === 0 ? (
                <VolumeX className="w-4 h-4 text-slate-500" />
              ) : (
                <Volume2 className="w-4 h-4 text-blue-700" />
              )}
              <span className="hidden sm:inline">音量</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
                aria-label="音声の音量"
                className="w-16 accent-blue-700"
              />
            </label>
          )}

          <button
            type="button"
            onClick={onToggleSubtitle}
            className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-2 rounded-lg border cursor-pointer ${
              showSubtitle
                ? 'bg-blue-50 border-blue-300 text-blue-800'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <Subtitles className="w-4 h-4" />
            字幕{showSubtitle ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            onClick={onResetSession}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            リセット
          </button>

          <button
            type="button"
            onClick={onEndSession}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-2 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            会話終了
          </button>
        </div>
      </div>

      {/* 文字入力フォーム */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="文字でもご質問いただけます（例：100万円くらいで軽自動車を探しています）"
          disabled={isThinking}
          maxLength={400}
          className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isThinking}
          className="inline-flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-bold text-sm px-4 py-2.5 rounded-xl cursor-pointer shrink-0"
        >
          <Send className="w-4 h-4" />
          送信
        </button>
      </form>
    </div>
  );
};
