import React, { useEffect, useRef } from 'react';
import { MapPin, Phone, MessageSquare, ExternalLink } from 'lucide-react';
import type { ChatMessage, CompanyInfo, Vehicle } from '../../types';
import { VehicleCard } from '../VehicleCard/VehicleCard';

interface ChatPanelProps {
  messages: ChatMessage[];
  vehiclesById: Record<string, Vehicle>;
  company: CompanyInfo | null;
  isThinking: boolean;
  interimTranscript?: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  vehiclesById,
  company,
  isThinking,
  interimTranscript,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // ページ全体が勝手に下へスクロールしてキャラクターが隠れるのを防ぐため、
    // 会話が2件以上になった時のみチャット枠内部だけをスクロールする
    if (messages.length > 1 && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, isThinking, interimTranscript]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto space-y-4 pr-1 py-2">
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        const recommendedVehicles = (msg.recommendedVehicleIds ?? [])
          .map((id) => vehiclesById[id])
          .filter(Boolean);

        return (
          <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
            <span className="text-[11px] font-semibold text-slate-500 mb-1 px-1">
              {isUser ? 'お客様' : 'ダイリン AI営業アシスタント'}
            </span>
            <div
              className={`max-w-[92%] md:max-w-[85%] rounded-2xl px-4 py-3 text-sm md:text-base leading-relaxed shadow-xs ${
                isUser
                  ? 'bg-blue-700 text-white rounded-br-sm'
                  : 'bg-white border border-blue-100 text-slate-800 rounded-bl-sm'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.displayText}</p>
            </div>

            {recommendedVehicles.length > 0 && (
              <div className="w-full mt-2.5 space-y-2.5">
                {recommendedVehicles.map((v) => (
                  <VehicleCard key={v.id} vehicle={v} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {interimTranscript && (
        <div className="flex flex-col items-end">
          <span className="text-[11px] font-semibold text-emerald-700 mb-1 px-1">
            認識中…
          </span>
          <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-emerald-50 border border-emerald-200 text-emerald-900">
            {interimTranscript}
          </div>
        </div>
      )}

      {isThinking && (
        <div className="flex flex-col items-start">
          <span className="text-[11px] font-semibold text-slate-500 mb-1 px-1">
            ダイリン AI営業アシスタント
          </span>
          <div className="bg-white border border-blue-100 rounded-2xl px-4 py-3 text-sm text-slate-500 flex items-center gap-2">
            <span className="inline-flex gap-1">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:120ms]" />
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:240ms]" />
            </span>
            <span>ダイリンの情報をお調べしています…</span>
          </div>
        </div>
      )}

      {company && messages.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
              <MapPin className="w-3.5 h-3.5 text-blue-700" />
              〒{company.postalCode} {company.address}
            </span>
            <a
              href={`tel:${company.phone}`}
              className="inline-flex items-center gap-1 font-bold text-blue-700 hover:underline"
            >
              <Phone className="w-3.5 h-3.5" />
              {company.phone}
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={company.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 bg-white border border-slate-300 px-2.5 py-1 rounded-lg font-medium hover:bg-slate-100"
            >
              Googleマップ
              <ExternalLink className="w-3 h-3" />
            </a>
            {company.lineUrl && (
              <a
                href={company.lineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 bg-emerald-600 text-white px-2.5 py-1 rounded-lg font-medium hover:bg-emerald-700"
              >
                <MessageSquare className="w-3 h-3" />
                公式LINE相談
              </a>
            )}
            <a
              href={company.contactUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 bg-blue-700 text-white px-2.5 py-1 rounded-lg font-medium hover:bg-blue-800"
            >
              WEBお問合せ
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
