import React from 'react';
import {
  Car,
  Sparkles,
  Wallet,
  Wrench,
  BadgeJapaneseYen,
  FileText,
  Paintbrush,
  MessageCircleQuestion,
} from 'lucide-react';

export interface ConsultationMenuItem {
  id: string;
  label: string;
  prompt: string;
  Icon: React.ElementType;
}

export const CONSULTATION_MENU: ConsultationMenuItem[] = [
  {
    id: 'used_car',
    label: '中古車を探す',
    prompt: '中古車を探しています。相談したいです。',
    Icon: Car,
  },
  {
    id: 'new_car',
    label: '新車を探す',
    prompt: '新車の購入を検討しています。相談したいです。',
    Icon: Sparkles,
  },
  {
    id: 'budget_search',
    label: '予算から車を探す',
    prompt: '予算に合わせて車を探したいです。',
    Icon: Wallet,
  },
  {
    id: 'inspection',
    label: '車検・点検の相談',
    prompt: '車検・点検について相談したいです。',
    Icon: Wrench,
  },
  {
    id: 'buyback',
    label: '車の買取相談',
    prompt: '今乗っている車の買取や査定について相談したいです。',
    Icon: BadgeJapaneseYen,
  },
  {
    id: 'car_lease',
    label: 'カーリースの相談',
    prompt: '毎月の支払いを抑えて新車に乗れるカーリースについて教えてください。',
    Icon: FileText,
  },
  {
    id: 'body_paint',
    label: '修理・鈑金の相談',
    prompt: '車のキズやへこみの修理・鈑金について相談したいです。',
    Icon: Paintbrush,
  },
  {
    id: 'other',
    label: 'その他のご相談',
    prompt: 'お店へのアクセスや営業時間、保険・レンタカーなどについて相談したいです。',
    Icon: MessageCircleQuestion,
  },
];

interface ServiceMenuProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export const ServiceMenu: React.FC<ServiceMenuProps> = ({ onSelect, disabled }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {CONSULTATION_MENU.map(({ id, label, prompt, Icon }) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(prompt)}
          className="flex items-center gap-2 text-left bg-white hover:bg-blue-50 active:bg-blue-100 disabled:opacity-50 border border-blue-200 rounded-xl px-3 py-2.5 text-xs md:text-sm font-semibold text-slate-800 shadow-xs transition-colors cursor-pointer"
        >
          <Icon className="w-4 h-4 text-blue-700 shrink-0" />
          <span className="leading-tight">{label}</span>
        </button>
      ))}
    </div>
  );
};
