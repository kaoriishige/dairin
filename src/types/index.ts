export type CharacterState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'introducing_vehicle';

export type SalesPurpose =
  | 'used_car'
  | 'new_car'
  | 'budget_search'
  | 'inspection'
  | 'buyback'
  | 'car_lease'
  | 'body_paint'
  | 'other'
  | 'unknown';

export type SalesPhase =
  | 'greeting'
  | 'hearing_condition'
  | 'vehicle_proposed'
  | 'vehicle_qa'
  | 'service_qa'
  | 'handoff_store';

export type KnowledgeCategory =
  | '会社情報'
  | '店舗情報'
  | '新車販売'
  | '中古車販売'
  | '車の買取'
  | 'カーリース'
  | '車検'
  | '点検・整備'
  | '鈑金・塗装'
  | '保険'
  | 'アフターサービス'
  | 'よくある質問'
  | '問い合わせ・来店案内'
  | '営業ノウハウ';

export interface Vehicle {
  id: string;
  maker: string;
  modelName: string;
  grade?: string;
  category: '軽自動車' | '普通車' | '新車' | '中古車' | 'その他';
  year?: string;
  mileage?: string;
  bodyType?: string;
  basePriceYen?: number | null;
  basePriceText?: string;
  totalPriceYen?: number | null;
  totalPriceText?: string;
  features: string[];
  imageUrl?: string;
  detailUrl: string;
  fetchedAt: string;
  stockStatusText: string;
  isAvailableConfirmed: false;
  notes?: string;
}

export interface PriceTableRow {
  label: string;
  columns: Record<string, string>;
}

export interface ServiceInfo {
  id: string;
  category: KnowledgeCategory;
  title: string;
  summary: string;
  details: string[];
  priceTable?: {
    headers: string[];
    rows: string[][];
    notes: string[];
    isParsedReliably: boolean;
  };
  sourceUrl: string;
  fetchedAt: string;
}

export interface CompanyInfo {
  companyName: string;
  storeName: string;
  representative?: string;
  established?: string;
  postalCode?: string;
  address: string;
  phone: string;
  businessHours: string;
  holidays: string;
  businessHoursNote?: string;
  servicesSummary: string[];
  features: string[];
  contactUrl: string;
  lineUrl?: string;
  googleMapsUrl: string;
  officialUrl: string;
  fetchedAt: string;
}

export interface DiscrepancyItem {
  id: string;
  field: string;
  description: string;
  sources: { url: string; value: string }[];
  status: 'needs_confirmation' | 'resolved';
  detectedAt: string;
}

export interface KnowledgeEntry {
  id: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  keywords: string[];
  sourceUrl?: string;
  sourceType: 'official_site' | 'sales_knowhow';
  approvalStatus: 'approved' | 'pending' | 'draft';
  updatedAt: string;
  author?: string;
}

export interface CustomerPreferences {
  purpose: SalesPurpose;
  budgetMaxYen?: number | null;
  budgetText?: string;
  preferredCarType?: string;
  preferredMaker?: string;
  usagePurpose?: string;
  passengerCount?: number | null;
  requiredFeatures: string[];
  purchaseTiming?: string;
  carModelForService?: string;
  carYearForService?: string;
  mileageForService?: string;
  inspectionTiming?: string;
  salesPhase?: SalesPhase;
  activeVehicleId?: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  displayText: string;
  speechText?: string;
  recommendedVehicleIds?: string[];
  createdAt: string;
}

export interface ConversationState {
  conversationId: string;
  lastQuestionText: string;
  lastAnswerText: string;
  salesPurpose: SalesPurpose;
  preferences: CustomerPreferences;
  introducedVehicleIds: string[];
  characterState: CharacterState;
  messages: ChatMessage[];
  startedAt: string;
  ttsCallsCount: number;
}

export interface CrawlDiffReport {
  checkedAt: string;
  addedVehicles: string[];
  updatedVehicles: string[];
  removedVehicles: string[];
  changedPrices: string[];
  changedServices: string[];
  needsConfirmation: DiscrepancyItem[];
  status: 'success' | 'partial_failure' | 'failed';
  message: string;
}

export interface ConversationLogEntry {
  id: string;
  conversationId: string;
  userMessage: string;
  assistantReply: string;
  recommendedVehicleIds: string[];
  rating?: 'good' | 'needs_improvement';
  evaluatorNote?: string;
  createdAt: string;
}

export interface ErrorLogEntry {
  id: string;
  source: 'chat' | 'tts' | 'speech_recognition' | 'crawl' | 'admin';
  message: string;
  detail?: string;
  createdAt: string;
}

export interface SystemHealthStatus {
  openaiConfigured: boolean;
  openaiModel: string;
  elevenlabsConfigured: boolean;
  elevenlabsVoiceId: string;
  elevenlabsModelId: string;
  ttsEnabled: boolean;
  voiceConnectionStatus?: 'connected' | 'unverified' | 'error' | 'quota_exceeded';
  voiceName?: string;
  characterCountUsed?: number;
  characterLimit?: number;
}
