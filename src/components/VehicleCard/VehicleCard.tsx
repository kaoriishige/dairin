import React, { useState } from 'react';
import { ExternalLink, Car, Calendar, Gauge, AlertCircle } from 'lucide-react';
import type { Vehicle } from '../../types';

interface VehicleCardProps {
  vehicle: Vehicle;
}

export const VehicleCard: React.FC<VehicleCardProps> = ({ vehicle }) => {
  const [imgError, setImgError] = useState(false);

  return (
    <article className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden flex flex-col sm:flex-row">
      {/* 車両写真 */}
      <div className="sm:w-44 md:w-48 h-36 sm:h-auto bg-slate-100 shrink-0 relative overflow-hidden">
        {vehicle.imageUrl && !imgError ? (
          <img
            src={vehicle.imageUrl}
            alt={`${vehicle.maker} ${vehicle.modelName}`}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-3 text-center">
            <Car className="w-8 h-8 mb-1" />
            <span className="text-xs">公式サイト掲載車両</span>
          </div>
        )}
        <span className="absolute top-2 left-2 bg-blue-700 text-white text-[11px] font-bold px-2 py-0.5 rounded">
          {vehicle.category}
        </span>
      </div>

      {/* 車両情報 */}
      <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="font-bold text-slate-900 text-base leading-snug">
              {vehicle.maker} {vehicle.modelName}
              {vehicle.grade ? (
                <span className="ml-1.5 text-sm font-medium text-slate-600">
                  {vehicle.grade}
                </span>
              ) : null}
            </h4>
            <span className="text-lg font-extrabold text-blue-700">
              {vehicle.basePriceText || '価格お問合せ'}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs md:text-sm text-slate-600">
            {vehicle.year && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                年式: {vehicle.year}
              </span>
            )}
            {vehicle.mileage && (
              <span className="inline-flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-blue-600" />
                走行距離: {vehicle.mileage}
              </span>
            )}
            {vehicle.bodyType && <span>タイプ: {vehicle.bodyType}</span>}
          </div>

          <p className="mt-1 text-xs text-slate-500">
            支払総額: {vehicle.totalPriceText || '未掲載（店舗へお問い合わせください）'}
          </p>

          {vehicle.features.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {vehicle.features.map((f) => (
                <span
                  key={f}
                  className="bg-blue-50 text-blue-800 border border-blue-100 text-xs px-2 py-0.5 rounded-md"
                >
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="text-[11px] text-amber-800 bg-amber-50 px-2 py-1 rounded inline-flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{vehicle.stockStatusText}</span>
          </p>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[11px] text-slate-400">
              取得: {new Date(vehicle.fetchedAt).toLocaleDateString('ja-JP')}
            </span>
            <a
              href={vehicle.detailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
            >
              公式詳細ページ
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
};
