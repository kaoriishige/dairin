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
  passcode?: string;
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('音声データの変換に失敗しました。'));
    reader.readAsDataURL(blob);
  });
}

export function useSpeechRecognition(): UseSpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const finalCallbackRef = useRef<((text: string) => void) | null>(null);
  const latestInterimRef = useRef<string>('');
  const hasDispatchedFinalRef = useRef<boolean>(false);

  // MediaRecorder フォールバック用（iOSアプリ内ブラウザ・Safari等でSpeechRecognitionが拒否される場合）
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceMonitorCleanupRef = useRef<(() => void) | null>(null);
  const passcodeRef = useRef<string>('');

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

  const canRecordFallback =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined';

  const isSupported = Boolean(SpeechRecognitionCtor) || canRecordFallback;

  const cleanupRecorderResources = useCallback(() => {
    if (recorderTimerRef.current) {
      clearTimeout(recorderTimerRef.current);
      recorderTimerRef.current = null;
    }
    if (silenceMonitorCleanupRef.current) {
      silenceMonitorCleanupRef.current();
      silenceMonitorCleanupRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  const stopListening = useCallback(() => {
    hasDispatchedFinalRef.current = true;
    latestInterimRef.current = '';
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      // ユーザーが明示停止したときは録音済み音声を文字起こしへ回す
      hasDispatchedFinalRef.current = false;
      try {
        recorderRef.current.stop();
      } catch {
        cleanupRecorderResources();
      }
    }
    setIsListening(false);
    setInterimTranscript('');
  }, [cleanupRecorderResources]);

  const startRecorderFallback = useCallback(
    async (options?: StartListeningOptions) => {
      if (!canRecordFallback) {
        if (!options?.silentOnAutoError) {
          setErrorMessage(
            'お使いのブラウザは音声入力に対応していないため、下の文字入力欄をご利用ください。'
          );
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const mimeCandidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
        const chosenMime =
          mimeCandidates.find((m) =>
            typeof MediaRecorder.isTypeSupported === 'function' ? MediaRecorder.isTypeSupported(m) : false
          ) || '';

        const recorder = chosenMime
          ? new MediaRecorder(stream, { mimeType: chosenMime })
          : new MediaRecorder(stream);
        recorderRef.current = recorder;

        const chunks: Blob[] = [];
        hasDispatchedFinalRef.current = false;

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            chunks.push(ev.data);
          }
        };

        recorder.onstop = async () => {
          const finalMime = recorder.mimeType || chosenMime || 'audio/webm';
          cleanupRecorderResources();
          setIsListening(false);
          setInterimTranscript('');

          if (hasDispatchedFinalRef.current || chunks.length === 0) {
            return;
          }
          hasDispatchedFinalRef.current = true;
          setInterimTranscript('音声を認識しています…');

          try {
            const audioBlob = new Blob(chunks, { type: finalMime });
            const audioBase64 = await blobToBase64(audioBlob);
            const res = await fetch('/api/stt', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(passcodeRef.current ? { 'x-demo-passcode': passcodeRef.current } : {}),
              },
              body: JSON.stringify({ audioBase64, mimeType: finalMime }),
            });
            const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
            setInterimTranscript('');
            if (!res.ok) {
              throw new Error(data.error || '音声認識に失敗しました。');
            }
            const recognized = (data.text || '').trim();
            if (recognized) {
              finalCallbackRef.current?.(recognized);
            } else {
              setErrorMessage('音声が聞き取れませんでした。もう一度お試しください。');
            }
          } catch (err) {
            setInterimTranscript('');
            setErrorMessage(
              err instanceof Error
                ? err.message
                : '音声の認識に失敗しました。下の文字入力欄をご利用ください。'
            );
          }
        };

        // 発話後の無音自動停止監視（1.6秒無音で自動送信）
        try {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            let heardSpeech = false;
            let lastSoundAt = Date.now();
            const interval = setInterval(() => {
              if (recorder.state !== 'recording') return;
              analyser.getByteTimeDomainData(dataArray);
              let maxDiff = 0;
              for (let i = 0; i < dataArray.length; i++) {
                const diff = Math.abs(dataArray[i] - 128);
                if (diff > maxDiff) maxDiff = diff;
              }
              if (maxDiff > 6) {
                heardSpeech = true;
                lastSoundAt = Date.now();
              } else if (heardSpeech && Date.now() - lastSoundAt > 1600) {
                try {
                  recorder.stop();
                } catch {
                  // ignore
                }
              }
            }, 150);
            silenceMonitorCleanupRef.current = () => {
              clearInterval(interval);
              source.disconnect();
              ctx.close().catch(() => {});
            };
          }
        } catch {
          // 無音監視が失敗しても手動停止・タイムアウトで動作する
        }

        recorderTimerRef.current = setTimeout(() => {
          if (recorder.state === 'recording') {
            try {
              recorder.stop();
            } catch {
              // ignore
            }
          }
        }, 15000);

        recorder.start(250);
        setIsListening(true);
        setInterimTranscript('聞いています…（話し終わると自動送信、またはマイクで停止）');
      } catch (err) {
        cleanupRecorderResources();
        setIsListening(false);
        setInterimTranscript('');
        if (!options?.silentOnAutoError) {
          const name = err instanceof Error ? err.name : '';
          if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
            setErrorMessage(
              'マイクの使用が許可されていません。ブラウザの設定でマイクを許可するか、メール・LINE内ブラウザの場合は「Safariで開く」をお試しください。'
            );
          } else {
            setErrorMessage('マイクの起動に失敗しました。下の文字入力欄をご利用ください。');
          }
        }
      }
    },
    [canRecordFallback, cleanupRecorderResources]
  );

  const startListening = useCallback(
    (onFinalTranscript: (text: string) => void, options?: StartListeningOptions) => {
      passcodeRef.current = options?.passcode || '';
      finalCallbackRef.current = onFinalTranscript;
      setErrorMessage(null);
      setInterimTranscript('');
      latestInterimRef.current = '';
      hasDispatchedFinalRef.current = false;

      if (!SpeechRecognitionCtor) {
        void startRecorderFallback(options);
        return;
      }

      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }

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

          // iOS Safari / アプリ内ブラウザ等でSpeechRecognitionが拒否された場合はMediaRecorder(/api/stt)へ自動フォールバック
          if (
            (event.error === 'not-allowed' || event.error === 'service-not-allowed') &&
            canRecordFallback
          ) {
            void startRecorderFallback(options);
            return;
          }

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
        if (canRecordFallback) {
          void startRecorderFallback(options);
        } else if (!options?.silentOnAutoError) {
          setErrorMessage(
            'マイクの起動に失敗しました。下の文字入力欄からご質問いただけます。'
          );
        }
      }
    },
    [SpeechRecognitionCtor, canRecordFallback, startRecorderFallback]
  );

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      cleanupRecorderResources();
    };
  }, [cleanupRecorderResources]);

  return {
    isSupported,
    isListening,
    interimTranscript,
    errorMessage,
    startListening,
    stopListening,
    clearError,
  };
}
