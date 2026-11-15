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

export interface UseSpeechRecognitionResult {
  isSupported: boolean;
  isListening: boolean;
  interimTranscript: string;
  errorMessage: string | null;
  startListening: (onFinalTranscript: (text: string) => void) => void;
  stopListening: () => void;
  clearError: () => void;
}

export function useSpeechRecognition(): UseSpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const finalCallbackRef = useRef<((text: string) => void) | null>(null);

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
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const startListening = useCallback(
    (onFinalTranscript: (text: string) => void) => {
      if (!SpeechRecognitionCtor) {
        setErrorMessage(
          'お使いのブラウザは音声認識に対応していないため、下の文字入力欄をご利用ください。'
        );
        return;
      }

      setErrorMessage(null);
      setInterimTranscript('');
      finalCallbackRef.current = onFinalTranscript;

      try {
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = 'ja-JP';
        recognition.interimResults = true;
        recognition.continuous = false;

        recognition.onresult = (event) => {
          let interim = '';
          let finalText = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) {
              finalText += res[0].transcript;
            } else {
              interim += res[0].transcript;
            }
          }
          setInterimTranscript(interim);
          if (finalText.trim()) {
            setInterimTranscript('');
            setIsListening(false);
            finalCallbackRef.current?.(finalText.trim());
          }
        };

        recognition.onerror = (event) => {
          setIsListening(false);
          setInterimTranscript('');
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setErrorMessage(
              'マイクの使用が許可されていません。ブラウザの設定でマイクを許可するか、下の文字入力をご利用ください。'
            );
          } else if (event.error === 'no-speech') {
            setErrorMessage('音声が聞き取れませんでした。もう一度お話しください。');
          } else if (event.error !== 'aborted') {
            setErrorMessage(
              '音声認識中にエラーが発生しました。文字入力からもご相談いただけます。'
            );
          }
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
        setErrorMessage(
          'マイクの起動に失敗しました。下の文字入力欄からご質問いただけます。'
        );
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
