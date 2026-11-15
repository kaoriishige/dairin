import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  CompanyInfo,
  DiscrepancyItem,
  KnowledgeEntry,
  ServiceInfo,
  Vehicle,
} from '../../../src/types';

async function readJsonFile<T>(relativePath: string): Promise<T> {
  const candidates = [
    path.resolve(process.cwd(), relativePath),
    path.resolve('/var/task', relativePath),
  ];
  for (const filePath of candidates) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      // try next
    }
  }
  throw new Error(`データファイルが見つかりません: ${relativePath}`);
}

export async function loadAllKnowledgeData(): Promise<{
  company: CompanyInfo;
  vehicles: Vehicle[];
  services: ServiceInfo[];
  knowledgeEntries: KnowledgeEntry[];
  discrepancies: DiscrepancyItem[];
}> {
  const [company, vehicles, services, knowledgeEntries, discrepancies] = await Promise.all([
    readJsonFile<CompanyInfo>('data/knowledge/company.json'),
    readJsonFile<Vehicle[]>('data/vehicles/vehicles.json'),
    readJsonFile<ServiceInfo[]>('data/services/services.json'),
    readJsonFile<KnowledgeEntry[]>('data/knowledge/knowledge_entries.json'),
    readJsonFile<DiscrepancyItem[]>('data/knowledge/discrepancies.json'),
  ]);

  return { company, vehicles, services, knowledgeEntries, discrepancies };
}
