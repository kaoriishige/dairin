import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Lock, Settings, ShieldCheck } from 'lucide-react';
import { ChatPanel } from '../../components/ChatPanel/ChatPanel';
import { SalesCharacter } from '../../components/SalesCharacter/SalesCharacter';
import { ServiceMenu } from '../../components/ServiceMenu/ServiceMenu';
import { VoiceControls } from '../../components/VoiceControls/VoiceControls';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { ElevenLabsStreamingPlayer } from '../../services/audio/elevenLabsPlayer';
import type {
  CharacterState,
  ChatMessage,
  CompanyInfo,
  ConversationLogEntry,
  CustomerPreferences,
  ErrorLogEntry,
  Vehicle,
} from '../../types';

const INITIAL_GREETING =
  'こんにちは！ オートギャラリー・ダイリンのAI営業アシスタントです。お車の購入や車検、修理など、どんなことでもお気軽にご相談ください！';

const INITIAL_PREFERENCES: CustomerPreferences = {
  purpose: 'unknown',
  requiredFeatures: [],
};

interface DemoPageProps {
  onOpenAdmin: () => void;
}

function appendLocalLog<T>(key: string, item: T, maxItems = 50) {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? (JSON.parse(raw) as T[]) : [];
    list.unshift(item);
    localStorage.setItem(key, JSON.stringify(list.slice(0, maxItems)));
  } catch {
    // ignore storage quota error
  }
}

export const DemoPage: React.FC<DemoPageProps> = ({ onOpenAdmin }) => {
  const [passcode, setPasscode] = useState<string>(() => sessionStorage.getItem('dairin_demo_passcode') || '');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeRequired, setPasscodeRequired] = useState(false);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);

  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [maxTtsCalls, setMaxTtsCalls] = useState(25);
  const [ttsCallsCount, setTtsCallsCount] = useState(0);

  const [sessionStarted, setSessionStarted] = useState(false);
  const [conversationId, setConversationId] = useState(() => `conv-${Date.now()}`);
  const [characterState, setCharacterState] = useState<CharacterState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [preferences, setPreferences] = useState<CustomerPreferences>(INITIAL_PREFERENCES);
  const [introducedVehicleIds, setIntroducedVehicleIds] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [volume, setVolume] = useState(0.9);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const playerRef = useRef<ElevenLabsStreamingPlayer | null>(null);
  if (!playerRef.current) {
    playerRef.current = new ElevenLabsStreamingPlayer();
  }

  const speech = useSpeechRecognition();

  const vehiclesById = useMemo(() => {
    const map: Record<string, Vehicle> = {};
    for (const v of vehicles) map[v.id] = v;
    return map;
  }, [vehicles]);

  const loadPublicData = useCallback(async (code: string) => {
    try {
      const res = await fetch('/api/public-data', {
        headers: code ? { 'x-demo-passcode': code } : {},
      });
      if (res.status === 401) {
        setPasscodeRequired(true);
        setPasscodeError(code ? 'パスコードが正しくありません。' : null);
        return;
      }
      if (!res.ok) {
        throw new Error('公式データの読み込みに失敗しました。');
      }
      const data = await res.json();
      setPasscodeRequired(false);
      setPasscodeError(null);
      setCompany(data.company);
      setVehicles(data.vehicles || []);
      setTtsEnabled(Boolean(data.runtime?.ttsEnabled));
      setMaxTtsCalls(data.runtime?.maxTtsCallsPerSession || 25);
    } catch (err) {
      setNoticeMessage(err instanceof Error ? err.message : 'データ取得エラーが発生しました。');
    }
  }, []);

  useEffect(() => {
    void loadPublicData(passcode);
    return () => {
      playerRef.current?.stop();
    };
  }, [loadPublicData, passcode]);

  const playAssistantVoice = useCallback(
    async (speechText: string, nextIdleState: CharacterState) => {
      if (!ttsEnabled || ttsCallsCount >= maxTtsCalls) {
        if (ttsCallsCount >= maxTtsCalls) {
          setNoticeMessage('セッションあたりの音声生成上限に達したため、文字チャットで継続します。');
        }
        setCharacterState(nextIdleState === 'introducing_vehicle' ? 'introducing_vehicle' : 'idle');
        return;
      }

      setTtsCallsCount((c) => c + 1);
      await playerRef.current?.speak(speechText, passcode, {
        onStart: () => {
          setIsSpeaking(true);
          setCharacterState(nextIdleState);
        },
        onAudioLevel: (lvl) => setAudioLevel(lvl),
        onEnd: () => {
          setIsSpeaking(false);
          setAudioLevel(0);
          setCharacterState((prev) =>
            prev === 'introducing_vehicle' ? 'introducing_vehicle' : 'idle'
          );
        },
        onFallbackToText: (reason) => {
          setIsSpeaking(false);
          setAudioLevel(0);
          setTtsEnabled(false);
          setNoticeMessage(reason);
          appendLocalLog<ErrorLogEntry>('dairin_error_logs', {
            id: `err-${Date.now()}`,
            source: 'tts',
            message: reason,
            createdAt: new Date().toISOString(),
          });
        },
      });
    },
    [maxTtsCalls, passcode, ttsCallsCount, ttsEnabled]
  );

  const handleStartSession = useCallback(() => {
    setSessionStarted(true);
    setNoticeMessage(null);
    const greetingMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      displayText: INITIAL_GREETING,
      speechText: INITIAL_GREETING,
      createdAt: new Date().toISOString(),
    };
    setMessages([greetingMsg]);
    void playAssistantVoice(INITIAL_GREETING, 'speaking');
  }, [playAssistantVoice]);

  const handleStopSpeaking = useCallback(() => {
    playerRef.current?.stop();
    setIsSpeaking(false);
    setAudioLevel(0);
    setCharacterState('idle');
  }, []);

  const handlePlaySampleVoice = useCallback(() => {
    speech.stopListening();
    void playerRef.current?.playStaticAudioUrl('/audio/dairin_voice_sample.mp3', {
      onStart: () => {
        setIsSpeaking(true);
        setCharacterState('speaking');
      },
      onAudioLevel: (lvl) => setAudioLevel(lvl),
      onEnd: () => {
        setIsSpeaking(false);
        setAudioLevel(0);
        setCharacterState('idle');
      },
      onFallbackToText: (reason) => {
        setIsSpeaking(false);
        setAudioLevel(0);
        setCharacterState('idle');
        setNoticeMessage(reason);
      },
    });
  }, [speech]);

  const handleSendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || isThinking) return;

      // 割り込み処理：再生中の音声・聞き取りを即停止
      playerRef.current?.stop();
      setIsSpeaking(false);
      setAudioLevel(0);
      speech.stopListening();

      if (!sessionStarted) {
        setSessionStarted(true);
      }

      const userMsg: ChatMessage = {
        id: `msg-u-${Date.now()}`,
        role: 'user',
        displayText: text,
        createdAt: new Date().toISOString(),
      };

      const nextHistory = [...messages, userMsg];
      setMessages(nextHistory);
      setIsThinking(true);
      setCharacterState('thinking');
      setNoticeMessage(null);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(passcode ? { 'x-demo-passcode': passcode } : {}),
          },
          body: JSON.stringify({
            conversationId,
            userMessage: text,
            history: nextHistory.map((m) => ({ role: m.role, displayText: m.displayText })),
            preferences,
            introducedVehicleIds,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'AI営業アシスタントとの通信に失敗しました。');
        }

        const recommendedIds: string[] = data.recommendedVehicleIds || [];
        const assistantMsg: ChatMessage = {
          id: `msg-a-${Date.now()}`,
          role: 'assistant',
          displayText: data.replyDisplayText,
          speechText: data.replySpeechText,
          recommendedVehicleIds: recommendedIds,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
        if (data.updatedPreferences) {
          setPreferences(data.updatedPreferences);
        }
        if (recommendedIds.length > 0) {
          setIntroducedVehicleIds((prev) => Array.from(new Set([...prev, ...recommendedIds])));
        }

        appendLocalLog<ConversationLogEntry>('dairin_test_conv_logs', {
          id: `log-${Date.now()}`,
          conversationId,
          userMessage: text,
          assistantReply: data.replyDisplayText,
          recommendedVehicleIds: recommendedIds,
          createdAt: new Date().toISOString(),
        });

        setIsThinking(false);
        const nextCharState: CharacterState =
          recommendedIds.length > 0 ? 'introducing_vehicle' : 'speaking';
        await playAssistantVoice(data.replySpeechText || data.replyDisplayText, nextCharState);
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : '通信エラーが発生しました。再度お試しください。';
        setIsThinking(false);
        setCharacterState('idle');
        setNoticeMessage(errMsg);
        appendLocalLog<ErrorLogEntry>('dairin_error_logs', {
          id: `err-${Date.now()}`,
          source: 'chat',
          message: errMsg,
          createdAt: new Date().toISOString(),
        });
      }
    },
    [
      conversationId,
      introducedVehicleIds,
      isThinking,
      messages,
      passcode,
      playAssistantVoice,
      preferences,
      sessionStarted,
      speech,
    ]
  );

  const handleToggleMic = useCallback(() => {
    if (speech.isListening) {
      speech.stopListening();
      setCharacterState('idle');
      return;
    }
    // AIが話している最中なら割り込み停止
    playerRef.current?.stop();
    setIsSpeaking(false);
    setAudioLevel(0);
    setCharacterState('listening');

    speech.startListening((transcript) => {
      void handleSendMessage(transcript);
    });
  }, [handleSendMessage, speech]);

  const handleResetSession = useCallback(() => {
    playerRef.current?.stop();
    speech.stopListening();
    setIsSpeaking(false);
    setIsThinking(false);
    setAudioLevel(0);
    setPreferences(INITIAL_PREFERENCES);
    setIntroducedVehicleIds([]);
    setConversationId(`conv-${Date.now()}`);
    setTtsCallsCount(0);
    setNoticeMessage(null);
    const greetingMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      displayText: INITIAL_GREETING,
      speechText: INITIAL_GREETING,
      createdAt: new Date().toISOString(),
    };
    setMessages([greetingMsg]);
    setCharacterState('idle');
  }, [speech]);

  const handleEndSession = useCallback(() => {
    playerRef.current?.stop();
    speech.stopListening();
    setIsSpeaking(false);
    setIsThinking(false);
    setAudioLevel(0);
    setSessionStarted(false);
    setMessages([]);
    setPreferences(INITIAL_PREFERENCES);
    setIntroducedVehicleIds([]);
    setCharacterState('idle');
  }, [speech]);

  const latestAssistantSubtitle = useMemo(() => {
    if (!showSubtitle) return undefined;
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    return last?.displayText;
  }, [messages, showSubtitle]);

  if (passcodeRequired) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-blue-200 shadow-md p-6 space-y-4">
          <div className="flex items-center gap-2 text-blue-800">
            <Lock className="w-6 h-6" />
            <h1 className="text-lg font-bold">関係者限定デモページ</h1>
          </div>
          <p className="text-sm text-slate-600">
            オートギャラリーダイリン AIキャラクター・オンライン営業デモをご覧いただくには、共有されたパスコードをご入力ください。
          </p>
          {passcodeError && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
              {passcodeError}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = passcodeInput.trim();
              sessionStorage.setItem('dairin_demo_passcode', trimmed);
              setPasscode(trimmed);
            }}
            className="space-y-3"
          >
            <input
              type="password"
              value={passcodeInput}
              onChange={(e) => setPasscodeInput(e.target.value)}
              placeholder="パスコードを入力"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 rounded-xl cursor-pointer"
            >
              デモページを開く
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50/40 flex flex-col">
      {/* 画面最上部：必須表記 */}
      <header className="bg-white border-b border-blue-100 shadow-2xs sticky top-0 z-20">
        <div className="bg-blue-800 text-white text-center py-1.5 px-3">
          <p className="text-xs md:text-sm font-bold tracking-wider">テスト用デモページ</p>
          <p className="text-[11px] md:text-xs text-blue-100">
            AIキャラクターが、お車選びや車検・整備のご相談を承ります
          </p>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0" />
            <div>
              <h1 className="text-sm md:text-base font-extrabold text-slate-900 leading-tight">
                オートギャラリーダイリン AIキャラクターオンライン営業
              </h1>
              <p className="text-[11px] text-slate-500">
                株式会社ジェイ・ピー（栃木県那須塩原市）公式情報連携デモ
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenAdmin}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-slate-200 cursor-pointer shrink-0"
          >
            <Settings className="w-3.5 h-3.5" />
            管理画面
          </button>
        </div>
      </header>

      {/* メインエリア：PCは左キャラクター・右会話 / スマホは上キャラクター・中央メニュー＆会話 */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 md:px-6 py-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* 左側（スマホでは上部）：女性キャラクター表示エリア */}
        <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-28 lg:self-start">
          <SalesCharacter
            state={speech.isListening ? 'listening' : characterState}
            audioLevel={audioLevel}
            subtitle={latestAssistantSubtitle}
            onPlaySampleVoice={handlePlaySampleVoice}
          />
        </div>

        {/* 右側（スマホでは中央〜下部）：営業メニュー・会話・車両紹介・操作パネル */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-3 min-h-[540px]">
          {/* 相談メニュー */}
          <section aria-label="ご相談メニュー" className="bg-blue-50/70 border border-blue-100 rounded-2xl p-3">
            <p className="text-xs font-bold text-blue-900 mb-2">
              ご希望のご相談内容をお選びください（そのまま会話が始まります）
            </p>
            <ServiceMenu
              onSelect={(prompt) => void handleSendMessage(prompt)}
              disabled={isThinking}
            />
          </section>

          {/* 音声認識エラー・システム通知 */}
          {(speech.errorMessage || noticeMessage) && (
            <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-3.5 py-2.5 text-xs md:text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                {speech.errorMessage && <p>{speech.errorMessage}</p>}
                {noticeMessage && <p>{noticeMessage}</p>}
              </div>
            </div>
          )}

          {/* 会話・車両紹介エリア */}
          <section
            aria-label="会話と車両紹介"
            className="flex-1 bg-slate-50/80 rounded-2xl border border-slate-200 p-3 md:p-4 flex flex-col min-h-[300px] max-h-[58vh] lg:max-h-[54vh]"
          >
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 p-4 space-y-2">
                <p className="text-sm md:text-base font-semibold text-slate-700">
                  「会話を始める」または上のメニューからご相談ください
                </p>
                <p className="text-xs max-w-md leading-relaxed">
                  例：「100万円くらいで軽自動車を探しています」「子どもが2人いるのでスライドドアの車を探しています」「軽自動車の車検はいくらですか？」
                </p>
              </div>
            ) : (
              <ChatPanel
                messages={messages}
                vehiclesById={vehiclesById}
                company={company}
                isThinking={isThinking}
                interimTranscript={speech.interimTranscript}
              />
            )}
          </section>

          {/* 下部：音声操作・文字入力 */}
          <VoiceControls
            sessionStarted={sessionStarted}
            isListening={speech.isListening}
            isSpeaking={isSpeaking}
            isThinking={isThinking}
            speechSupported={speech.isSupported}
            ttsEnabled={ttsEnabled}
            volume={volume}
            showSubtitle={showSubtitle}
            onStartSession={handleStartSession}
            onEndSession={handleEndSession}
            onResetSession={handleResetSession}
            onToggleMic={handleToggleMic}
            onStopSpeaking={handleStopSpeaking}
            onChangeVolume={(v) => {
              setVolume(v);
              playerRef.current?.setVolume(v);
            }}
            onToggleSubtitle={() => setShowSubtitle((s) => !s)}
            onSendText={(txt) => void handleSendMessage(txt)}
          />
        </div>
      </main>
    </div>
  );
};
