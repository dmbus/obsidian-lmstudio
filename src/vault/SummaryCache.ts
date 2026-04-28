export interface IndividualSummaryCache {
  documentPath: string;
  contentHash: string;
  summary: string;
  generatedAt: number;
}

export interface FolderSummaryCache {
  folderPath: string;
  contentHashes: string[];
  summaryHash: string;
  summary: string;
  generatedAt: number;
}

export interface VaultSummaryCache {
  folderSummaryHashes: string[];
  summary: string;
  generatedAt: number;
}

export interface SummaryCache {
  individualSummaries: Record<string, IndividualSummaryCache>;
  folderSummaries: Record<string, FolderSummaryCache>;
  vaultSummary: VaultSummaryCache | null;
  lastCleanup: number;
}

export class SummaryCacheService {
  generateHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  isExpired(entry: { generatedAt: number }, expirationDays: number): boolean {
    if (expirationDays <= 0) return false;
    const expirationMs = expirationDays * 24 * 60 * 60 * 1000;
    return Date.now() > entry.generatedAt + expirationMs;
  }

  isIndividualCacheValid(
    cached: IndividualSummaryCache,
    currentContentHash: string,
    expirationDays: number
  ): boolean {
    if (!cached) return false;
    if (cached.contentHash !== currentContentHash) return false;
    return !this.isExpired(cached, expirationDays);
  }

  canUseCachedFolderSummary(
    cached: FolderSummaryCache,
    currentHashes: string[],
    expirationDays: number
  ): boolean {
    if (!cached) return false;
    if (!this.arraysEqual(cached.contentHashes, currentHashes)) return false;
    return !this.isExpired(cached, expirationDays);
  }

  canUseCachedVaultSummary(
    cached: VaultSummaryCache,
    currentFolderHashes: string[],
    expirationDays: number
  ): boolean {
    if (!cached) return false;
    if (!this.arraysEqual(cached.folderSummaryHashes, currentFolderHashes)) return false;
    return !this.isExpired(cached, expirationDays);
  }

  arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  pruneExpired(
    cache: SummaryCache,
    expirationDays: number
  ): void {
    const now = Date.now();
    const expirationMs = expirationDays * 24 * 60 * 60 * 1000;

    for (const key of Object.keys(cache.individualSummaries)) {
      if (now > cache.individualSummaries[key].generatedAt + expirationMs) {
        delete cache.individualSummaries[key];
      }
    }

    for (const key of Object.keys(cache.folderSummaries)) {
      if (now > cache.folderSummaries[key].generatedAt + expirationMs) {
        delete cache.folderSummaries[key];
      }
    }

    if (cache.vaultSummary && now > cache.vaultSummary.generatedAt + expirationMs) {
      cache.vaultSummary = null;
    }

    cache.lastCleanup = now;
  }

  pruneToSize(
    cache: SummaryCache,
    maxSize: number
  ): void {
    const entries = Object.values(cache.individualSummaries);
    if (entries.length <= maxSize) return;

    entries.sort((a, b) => a.generatedAt - b.generatedAt);

    const toRemove = entries.length - maxSize;
    for (let i = 0; i < toRemove; i++) {
      const oldestKey = entries[i].documentPath;
      delete cache.individualSummaries[oldestKey];
    }
  }

  createEmptyCache(): SummaryCache {
    return {
      individualSummaries: {},
      folderSummaries: {},
      vaultSummary: null,
      lastCleanup: Date.now(),
    };
  }
}