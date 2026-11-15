import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { ChatPanel } from '../../components/ChatPanel/ChatPanel';
import { SalesCharacter } from '../../components/SalesCharacter/SalesCharacter';
import { ServiceMenu } from '../../components/ServiceMenu/ServiceMenu';
import { VoiceControls } from '../../components/VoiceControls/VoiceControls';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import {
  ElevenLabsStreamingPlayer,
  type FemaleVoiceChoice,
  type MouthVowelShape,
} from '../../services/audio/elevenLabsPlayer';
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
  'こんにちは！ オートギャラリー・ダイリンのAI営業アシスタントです。今日はどのようなお車をお探しですか？';

const INITIAL_GREETING_SPEECH =
  'こんにちは！ オートギャラリー・ダイリンのAI営業アシスタントです。今日はどのようなお車をお探しですか？';

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

function safeGetSessionStorage(key: string): string {
  try {
    return sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeSetSessionStorage(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore in private mode
  }
}

export const DemoPage: React.FC<DemoPageProps> = () => {
  const [passcode, setPasscode] = useState<string>(() => safeGetSessionStorage('dairin_demo_passcode'));
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
  const [currentVowel, setCurrentVowel] = useState<MouthVowelShape>('closed');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [preferences, setPreferences] = useState<CustomerPreferences>(INITIAL_PREFERENCES);
  const [introducedVehicleIds, setIntroducedVehicleIds] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [volume, setVolume] = useState(0.9);
  const [voiceChoice, setVoiceChoice] = useState<FemaleVoiceChoice>('fn6Wir86vS59qP6PheHG');
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const playerRef = useRef<ElevenLabsStreamingPlayer | null>(null);
  if (!playerRef.current) {
    playerRef.current = new ElevenLabsStreamingPlayer();
  }

  const getLiveVoiceMetrics = useCallback(() => {
    return (
      playerRef.current?.getLiveVoiceMetrics() ?? {
        level: 0,
        openY: 0,
        formRow: 1.0,
        vowel: 'closed' as const,
        isPlaying: false,
      }
    );
  }, []);

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
        onAudioLevel: (lvl, vowelShape) => {
          setAudioLevel(lvl);
          setCurrentVowel(vowelShape ?? 'closed');
        },
        onEnd: () => {
          setIsSpeaking(false);
          setAudioLevel(0);
          setCurrentVowel('closed');
          setCharacterState((prev) =>
            prev === 'introducing_vehicle' ? 'introducing_vehicle' : 'idle'
          );
        },
        onFallbackToText: (reason) => {
          setIsSpeaking(false);
          setAudioLevel(0);
          setCurrentVowel('closed');
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
    playerRef.current?.unlockAudioForMobile();
    setSessionStarted(true);
    setNoticeMessage(null);
    const greetingMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      displayText: INITIAL_GREETING,
      speechText: INITIAL_GREETING_SPEECH,
      createdAt: new Date().toISOString(),
    };
    setMessages([greetingMsg]);
    // 会話開始時に画面が一番下へ飛ばず、上部のキャラクターが必ず表示されたままになるよう最上部を維持
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    void playAssistantVoice(INITIAL_GREETING_SPEECH, 'speaking');
  }, [playAssistantVoice]);

  const handleStopSpeaking = useCallback(() => {
    playerRef.current?.stop();
    setIsSpeaking(false);
    setAudioLevel(0);
    setCurrentVowel('closed');
    setCharacterState('idle');
  }, []);

  const handleSendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || isThinking) return;

      // 割り込み処理：再生中の音声・聞き取りを即停止＋モバイル音声アンロック
      playerRef.current?.stop();
      playerRef.current?.unlockAudioForMobile();
      setIsSpeaking(false);
      setAudioLevel(0);
      setCurrentVowel('closed');
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
    setCurrentVowel('closed');
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
    setCurrentVowel('closed');
    setPreferences(INITIAL_PREFERENCES);
    setIntroducedVehicleIds([]);
    setConversationId(`conv-${Date.now()}`);
    setTtsCallsCount(0);
    setNoticeMessage(null);
    const greetingMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      displayText: INITIAL_GREETING,
      speechText: INITIAL_GREETING_SPEECH,
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
    setCurrentVowel('closed');
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
              safeSetSessionStorage('dairin_demo_passcode', trimmed);
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
      {/* 画面最上部：ダイリン短文説明を統合したスリムヘッダー */}
      <header className="bg-blue-800 text-white text-center py-2 px-3 shadow-xs sticky top-0 z-20">
        <h1 className="text-xs md:text-sm font-bold tracking-wide">
          オートギャラリーダイリン AI営業デモ（テスト用）
        </h1>
        <p className="text-[11px] md:text-xs text-blue-100 mt-0.5">
          株式会社ジェイ・ピー｜お車選び・車検・整備のご相談をAIが承ります
        </p>
      </header>

      {/* メインエリア：スマホでは「キャラ → 会話を始める →（開始後にチャット欄＆相談メニュー）」の順 */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 md:px-6 py-3 md:py-4 grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4 items-start">
        {/* 左側（スマホでは上部）：女性キャラクター表示エリア */}
        <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-16">
          <SalesCharacter
            state={speech.isListening ? 'listening' : characterState}
            audioLevel={audioLevel}
            vowel={currentVowel}
            getLiveVoiceMetrics={getLiveVoiceMetrics}
            voiceChoice={voiceChoice}
            onChangeVoiceChoice={(choice) => {
              setVoiceChoice(choice);
              playerRef.current?.setVoiceChoice(choice);
            }}
            subtitle={latestAssistantSubtitle}
          />
        </div>

        {/* 右側（スマホではキャラクターのすぐ下）：会話を始めるボタン＆会話開始後のチャット欄 */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-3">
          {/* キャラのすぐ下に「会話を始める」（開始後は音声・文字入力操作）を配置 */}
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

          {/* 会話を始めた後にのみ、チャット欄と「ご希望のご相談内容（メニュー）」を表示 */}
          {sessionStarted && (
            <section
              aria-label="会話と車両紹介"
              className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3 md:p-4 flex flex-col gap-3"
            >
              {/* チャット欄の中に配置した「ご希望のご相談内容をお選びください」 */}
              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-2.5">
                <p className="text-xs font-bold text-blue-900 mb-2">
                  ご希望のご相談内容をお選びください（タップでご相談できます）
                </p>
                <ServiceMenu
                  onSelect={(prompt) => void handleSendMessage(prompt)}
                  disabled={isThinking}
                />
              </div>

              <div className="flex flex-col min-h-[240px] max-h-[55vh]">
                <ChatPanel
                  messages={messages}
                  vehiclesById={vehiclesById}
                  company={company}
                  isThinking={isThinking}
                  interimTranscript={speech.interimTranscript}
                />
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};
