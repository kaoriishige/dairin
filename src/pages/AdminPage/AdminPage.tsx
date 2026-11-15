import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Plus,
  Shield,
  LogOut,
} from 'lucide-react';
import type {
  CompanyInfo,
  ConversationLogEntry,
  CrawlDiffReport,
  DiscrepancyItem,
  ErrorLogEntry,
  KnowledgeCategory,
  KnowledgeEntry,
  ServiceInfo,
  SystemHealthStatus,
  Vehicle,
} from '../../types';

interface AdminPageProps {
  onBackToDemo: () => void;
}

interface AdminPayload {
  company: CompanyInfo;
  vehicles: Vehicle[];
  services: ServiceInfo[];
  knowledgeEntries: KnowledgeEntry[];
  discrepancies: DiscrepancyItem[];
  health: SystemHealthStatus;
  checkedAt: string;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onBackToDemo }) => {
  const [adminToken, setAdminToken] = useState(() => {
    try {
      return sessionStorage.getItem('dairin_admin_token') || '';
    } catch {
      return '';
    }
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [data, setData] = useState<AdminPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [crawlReport, setCrawlReport] = useState<CrawlDiffReport | null>(null);

  const [convLogs, setConvLogs] = useState<ConversationLogEntry[]>([]);
  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>([]);
  const [customKnowhow, setCustomKnowhow] = useState<KnowledgeEntry[]>([]);

  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<KnowledgeCategory>('営業ノウハウ');
  const [activeTab, setActiveTab] = useState<
    'overview' | 'vehicles' | 'services' | 'discrepancies' | 'knowhow' | 'logs'
  >('overview');

  const loadLocalLogs = useCallback(() => {
    try {
      const cRaw = localStorage.getItem('dairin_test_conv_logs');
      setConvLogs(cRaw ? (JSON.parse(cRaw) as ConversationLogEntry[]) : []);
      const eRaw = localStorage.getItem('dairin_error_logs');
      setErrorLogs(eRaw ? (JSON.parse(eRaw) as ErrorLogEntry[]) : []);
      const kRaw = localStorage.getItem('dairin_custom_knowhow');
      setCustomKnowhow(kRaw ? (JSON.parse(kRaw) as KnowledgeEntry[]) : []);
    } catch {
      // ignore
    }
  }, []);

  const fetchAdminData = useCallback(
    async (token: string) => {
      if (!token) return;
      setLoading(true);
      setAuthError(null);
      try {
        const res = await fetch('/api/admin-data', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) {
          setIsAuthenticated(false);
          setAuthError(json.error || '認証に失敗しました。');
          return;
        }
        setData(json as AdminPayload);
        setIsAuthenticated(true);
        loadLocalLogs();
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : '通信エラーが発生しました。');
      } finally {
        setLoading(false);
      }
    },
    [loadLocalLogs]
  );

  useEffect(() => {
    if (adminToken) {
      void fetchAdminData(adminToken);
    }
  }, [adminToken, fetchAdminData]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const t = passwordInput.trim();
    try {
      sessionStorage.setItem('dairin_admin_token', t);
    } catch {
      // ignore
    }
    setAdminToken(t);
  };

  const handleLogout = () => {
    try {
      sessionStorage.removeItem('dairin_admin_token');
    } catch {
      // ignore
    }
    setAdminToken('');
    setIsAuthenticated(false);
    setData(null);
  };

  const handleRunCrawl = async () => {
    if (!adminToken || crawling) return;
    setCrawling(true);
    try {
      const res = await fetch('/api/admin-crawl', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const json = await res.json();
      if (res.ok && json.report) {
        setCrawlReport(json.report as CrawlDiffReport);
      }
    } finally {
      setCrawling(false);
    }
  };

  const handleRateConversation = (id: string, rating: 'good' | 'needs_improvement') => {
    const updated = convLogs.map((l) => (l.id === id ? { ...l, rating } : l));
    setConvLogs(updated);
    localStorage.setItem('dairin_test_conv_logs', JSON.stringify(updated));
  };

  const handleAddKnowhow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    const entry: KnowledgeEntry = {
      id: `kn-custom-${Date.now()}`,
      category: newCategory,
      title: newTitle.trim(),
      content: newContent.trim(),
      keywords: [newCategory, newTitle.trim()],
      sourceType: 'sales_knowhow',
      approvalStatus: 'pending',
      updatedAt: new Date().toISOString(),
      author: '管理者追加',
    };
    const next = [entry, ...customKnowhow];
    setCustomKnowhow(next);
    localStorage.setItem('dairin_custom_knowhow', JSON.stringify(next));
    setNewTitle('');
    setNewContent('');
  };

  const handleToggleApproval = (id: string) => {
    const next = customKnowhow.map((k) =>
      k.id === id
        ? {
            ...k,
            approvalStatus:
              k.approvalStatus === 'approved' ? ('pending' as const) : ('approved' as const),
          }
        : k
    );
    setCustomKnowhow(next);
    localStorage.setItem('dairin_custom_knowhow', JSON.stringify(next));
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-md p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-800">
              <Shield className="w-6 h-6" />
              <h1 className="text-lg font-bold">ダイリン AI営業 管理画面ログイン</h1>
            </div>
            <button
              type="button"
              onClick={onBackToDemo}
              className="text-xs text-slate-600 hover:text-blue-700 inline-flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              デモへ戻る
            </button>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            一般利用者からはアクセスできない管理者専用画面です。サーバー環境変数 <code>ADMIN_PASSWORD</code> に設定された管理者パスワードをご入力ください。
          </p>

          {authError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-2.5">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="管理者パスワード"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-2.5 rounded-xl cursor-pointer disabled:opacity-50"
            >
              {loading ? '確認中…' : 'ログイン'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToDemo}
              className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              デモ画面へ戻る
            </button>
            <h1 className="text-base md:text-lg font-bold text-slate-900">
              オートギャラリーダイリン AI営業 管理画面
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleRunCrawl()}
              disabled={crawling}
              className="inline-flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold px-3.5 py-2 rounded-lg cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${crawling ? 'animate-spin' : ''}`} />
              {crawling ? '公式サイト確認中…' : 'ホームページ情報を更新'}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-rose-700 border border-slate-200 px-2.5 py-2 rounded-lg cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* タブ */}
        <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {(
            [
              ['overview', 'API状態・会社情報'],
              ['vehicles', `車両情報 (${data?.vehicles.length ?? 0})`],
              ['services', `サービス情報 (${data?.services.length ?? 0})`],
              ['discrepancies', `要確認情報 (${data?.discrepancies.length ?? 0})`],
              ['knowhow', '営業知識・ノウハウ管理'],
              ['logs', `会話評価・エラーログ (${convLogs.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`px-3.5 py-2 rounded-lg text-xs md:text-sm font-semibold cursor-pointer ${
                activeTab === key
                  ? 'bg-blue-700 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* 更新レポート */}
        {crawlReport && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2 text-xs md:text-sm">
            <div className="flex items-center justify-between">
              <strong className="text-blue-900">公式サイト再取得・差分チェック結果</strong>
              <span className="text-slate-500">
                {new Date(crawlReport.checkedAt).toLocaleString('ja-JP')}
              </span>
            </div>
            <p className="text-slate-800">{crawlReport.message}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
              <div className="bg-white rounded p-2 border border-blue-100">
                追加車両: {crawlReport.addedVehicles.length}件
              </div>
              <div className="bg-white rounded p-2 border border-blue-100">
                変更可能性: {crawlReport.updatedVehicles.length}件
              </div>
              <div className="bg-white rounded p-2 border border-blue-100">
                掲載終了候補: {crawlReport.removedVehicles.length}件
              </div>
            </div>
          </div>
        )}

        {activeTab === 'overview' && data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* API & ElevenLabs 状態 */}
            <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h2 className="font-bold text-slate-900">API・ElevenLabs接続状況</h2>
              <dl className="grid grid-cols-2 gap-2 text-xs md:text-sm">
                <dt className="text-slate-500">OpenAI API</dt>
                <dd className="font-semibold">
                  {data.health.openaiConfigured ? (
                    <span className="text-emerald-700 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> 設定済み ({data.health.openaiModel})
                    </span>
                  ) : (
                    <span className="text-rose-700">未設定</span>
                  )}
                </dd>

                <dt className="text-slate-500">ElevenLabs API</dt>
                <dd className="font-semibold">
                  {data.health.elevenlabsConfigured ? (
                    <span className="text-emerald-700">
                      接続状態: {data.health.voiceConnectionStatus}
                      {data.health.voiceName ? ` (${data.health.voiceName})` : ''}
                    </span>
                  ) : (
                    <span className="text-rose-700">未設定</span>
                  )}
                </dd>

                <dt className="text-slate-500">確定Voice ID</dt>
                <dd className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">
                  {data.health.elevenlabsVoiceId}
                </dd>

                <dt className="text-slate-500">音声モデル</dt>
                <dd className="font-mono text-xs">{data.health.elevenlabsModelId}</dd>

                <dt className="text-slate-500">公開音声出力</dt>
                <dd>{data.health.ttsEnabled ? '有効' : '無効（文字チャットモード）'}</dd>

                <dt className="text-slate-500">ElevenLabs利用文字数</dt>
                <dd>
                  {data.health.characterCountUsed !== undefined
                    ? `${data.health.characterCountUsed.toLocaleString()} / ${data.health.characterLimit?.toLocaleString() ?? '-'}`
                    : '未取得（APIキー設定後に表示）'}
                </dd>
              </dl>
            </section>

            {/* 会社情報 */}
            <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 text-xs md:text-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-900">会社・店舗情報</h2>
                <span className="text-xs text-slate-400">
                  最終取得: {new Date(data.company.fetchedAt).toLocaleString('ja-JP')}
                </span>
              </div>
              <p>
                <strong>社名・店舗:</strong> {data.company.companyName} {data.company.storeName}
              </p>
              <p>
                <strong>所在地:</strong> 〒{data.company.postalCode} {data.company.address}
              </p>
              <p>
                <strong>電話:</strong> {data.company.phone}
              </p>
              <p>
                <strong>営業時間:</strong> {data.company.businessHours}
              </p>
              <p>
                <strong>定休日:</strong> {data.company.holidays}
              </p>
            </section>
          </div>
        )}

        {activeTab === 'vehicles' && data && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">メーカー・車名</th>
                  <th className="p-3">区分</th>
                  <th className="p-3">年式</th>
                  <th className="p-3">走行距離</th>
                  <th className="p-3">本体価格</th>
                  <th className="p-3">在庫状態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.vehicles.map((v) => (
                  <tr key={v.id}>
                    <td className="p-3 font-mono text-xs">{v.id}</td>
                    <td className="p-3 font-semibold">
                      {v.maker} {v.modelName} {v.grade}
                    </td>
                    <td className="p-3">{v.category}</td>
                    <td className="p-3">{v.year}</td>
                    <td className="p-3">{v.mileage}</td>
                    <td className="p-3">{v.basePriceText}</td>
                    <td className="p-3 text-amber-700 text-xs">{v.stockStatusText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'services' && data && (
          <div className="space-y-3">
            {data.services.map((s) => (
              <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">
                    [{s.category}] {s.title}
                  </h3>
                  <a
                    href={s.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-700 hover:underline"
                  >
                    参照元
                  </a>
                </div>
                <p className="text-xs md:text-sm text-slate-700">{s.summary}</p>
                <ul className="list-disc pl-5 text-xs text-slate-600 space-y-0.5">
                  {s.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'discrepancies' && data && (
          <div className="space-y-3">
            {data.discrepancies.map((d) => (
              <div
                key={d.id}
                className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 text-xs md:text-sm"
              >
                <div className="flex items-center gap-2 font-bold text-amber-900">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{d.field}（要確認）</span>
                </div>
                <p className="text-slate-800">{d.description}</p>
                <ul className="space-y-1 text-xs text-slate-700">
                  {d.sources.map((src, i) => (
                    <li key={i} className="bg-white/80 rounded p-2 border border-amber-100">
                      <strong>{src.url}:</strong> {src.value}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'knowhow' && data && (
          <div className="space-y-4">
            <form
              onSubmit={handleAddKnowhow}
              className="bg-white rounded-xl border border-slate-200 p-4 space-y-3"
            >
              <h2 className="font-bold text-slate-900 text-sm">
                営業ノウハウ・知識の追加（将来学習機能対応・承認管理）
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as KnowledgeCategory)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs md:text-sm"
                >
                  <option value="営業ノウハウ">営業ノウハウ</option>
                  <option value="中古車販売">中古車販売</option>
                  <option value="車検">車検</option>
                  <option value="カーリース">カーリース</option>
                  <option value="よくある質問">よくある質問</option>
                </select>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="タイトル（例：軽スライドドア比較の案内ポイント）"
                  className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-xs md:text-sm"
                />
              </div>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={3}
                placeholder="接客で使う営業ノウハウや注意点の内容"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs md:text-sm"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                ノウハウを追加（承認待ちとして登録）
              </button>
            </form>

            <div className="space-y-2">
              {[...customKnowhow, ...data.knowledgeEntries].map((k) => {
                const isCustom = customKnowhow.some((c) => c.id === k.id);
                return (
                  <div
                    key={k.id}
                    className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start justify-between gap-3 text-xs md:text-sm"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded text-xs font-semibold">
                          {k.category}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            k.approvalStatus === 'approved'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {k.approvalStatus === 'approved' ? '承認済み' : '承認待ち'}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-900">{k.title}</h3>
                      <p className="text-slate-600 mt-1">{k.content}</p>
                    </div>
                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => handleToggleApproval(k.id)}
                        className="shrink-0 bg-slate-100 hover:bg-blue-50 border border-slate-300 px-2.5 py-1 rounded text-xs font-semibold cursor-pointer"
                      >
                        {k.approvalStatus === 'approved' ? '承認取消' : '承認する'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h2 className="font-bold text-slate-900 text-sm">テスト会話履歴とAI回答評価</h2>
              {convLogs.length === 0 ? (
                <p className="text-xs text-slate-500">まだテスト会話履歴はありません。</p>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {convLogs.map((log) => (
                    <div key={log.id} className="border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
                      <p className="text-slate-500">
                        {new Date(log.createdAt).toLocaleString('ja-JP')}
                      </p>
                      <p>
                        <strong>お客様:</strong> {log.userMessage}
                      </p>
                      <p>
                        <strong>AI:</strong> {log.assistantReply}
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleRateConversation(log.id, 'good')}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded border cursor-pointer ${
                            log.rating === 'good'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          <ThumbsUp className="w-3 h-3" /> 良い回答
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRateConversation(log.id, 'needs_improvement')}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded border cursor-pointer ${
                            log.rating === 'needs_improvement'
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          <ThumbsDown className="w-3 h-3" /> 要改善
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h2 className="font-bold text-slate-900 text-sm">エラーログ</h2>
              {errorLogs.length === 0 ? (
                <p className="text-xs text-slate-500">エラーログはありません。</p>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {errorLogs.map((e) => (
                    <div key={e.id} className="border border-rose-200 bg-rose-50 rounded-lg p-2.5 text-xs">
                      <p className="font-semibold text-rose-800">
                        [{e.source}] {new Date(e.createdAt).toLocaleString('ja-JP')}
                      </p>
                      <p className="text-rose-900 mt-0.5">{e.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
};
