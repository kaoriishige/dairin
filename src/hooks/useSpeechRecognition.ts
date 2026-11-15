import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstanceLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export interface StartListeningOptions {
  silentOnAutoError?: boolean;
}

export interface UseSpeechRecognitionResult {
  isSupported: boolean;
  isListening: boolean;
  interimTranscript: string;
  errorMessage: string | null;
  startListening: (
    onFinalTranscript: (text: string) => void,
    options?: StartListeningOptions
  ) => void;
  stopListening: () => void;
  clearError: () => void;
}

export function useSpeechRecognition(): UseSpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const finalCallbackRef = useRef<((text: string) => void) | null>(null);
  const latestInterimRef = useRef<string>('');
  const hasDispatchedFinalRef = useRef<boolean>(false);

  const SpeechRecognitionCtor =
    typeof window !== 'undefined'
      ? (window as unknown as {
          SpeechRecognition?: new () => SpeechRecognitionInstanceLike;
          webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
        }).SpeechRecognition ||
        (window as unknown as {
          webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
        }).webkitSpeechRecognition
      : undefined;

  const isSupported = Boolean(SpeechRecognitionCtor);

  const stopListening = useCallback(() => {
    hasDispatchedFinalRef.current = true;
    latestInterimRef.current = '';
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const startListening = useCallback(
    (onFinalTranscript: (text: string) => void, options?: StartListeningOptions) => {
      if (!SpeechRecognitionCtor) {
        if (!options?.silentOnAutoError) {
          setErrorMessage(
            'お使いのブラウザは音声認識に対応していないため、下の文字入力欄をご利用ください。'
          );
        }
        return;
      }

      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }

      setErrorMessage(null);
      setInterimTranscript('');
      latestInterimRef.current = '';
      hasDispatchedFinalRef.current = false;
      finalCallbackRef.current = onFinalTranscript;

      try {
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = 'ja-JP';
        recognition.interimResults = true;
        recognition.continuous = false;

        recognition.onresult = (event) => {
          let interim = '';
          let finalText = '';
          for (let i = 0; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) {
              finalText += res[0].transcript;
            } else {
              interim += res[0].transcript;
            }
          }
          latestInterimRef.current = interim || finalText;
          setInterimTranscript(interim);
          if (finalText.trim() && !hasDispatchedFinalRef.current) {
            hasDispatchedFinalRef.current = true;
            latestInterimRef.current = '';
            setInterimTranscript('');
            setIsListening(false);
            try {
              recognition.stop();
            } catch {
              // ignore
            }
            finalCallbackRef.current?.(finalText.trim());
          }
        };

        recognition.onerror = (event) => {
          setIsListening(false);
          setInterimTranscript('');
          latestInterimRef.current = '';
          if (options?.silentOnAutoError) {
            return;
          }
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setErrorMessage(
              'マイクの使用が許可されていません。ブラウザの設定でマイクを許可するか、下の文字入力をご利用ください。'
            );
          } else if (event.error === 'no-speech') {
            setErrorMessage('音声が聞き取れませんでした。「マイクで話す」を押してお話しください。');
          } else if (event.error !== 'aborted') {
            setErrorMessage(
              '音声認識が中断されました。もう一度「マイクで話す」を押すか文字入力をご利用ください。'
            );
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          // iOS Safari 等で isFinal=true にならずに onend が呼ばれた場合も認識済みテキストを送信する
          const pending = latestInterimRef.current.trim();
          if (pending && !hasDispatchedFinalRef.current) {
            hasDispatchedFinalRef.current = true;
            latestInterimRef.current = '';
            setInterimTranscript('');
            finalCallbackRef.current?.(pending);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
        if (!options?.silentOnAutoError) {
          setErrorMessage(
            'マイクの起動に失敗しました。下の文字入力欄からご質問いただけます。'
          );
        }
      }
    },
    [SpeechRecognitionCtor]
  );

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    interimTranscript,
    errorMessage,
    startListening,
    stopListening,
    clearError: () => setErrorMessage(null),
  };
}
