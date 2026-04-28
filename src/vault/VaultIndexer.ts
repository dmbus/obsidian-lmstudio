import { TFile } from "obsidian";

export interface VaultDocument {
	id: string;
	path: string;
	name: string;
	basename: string;
	summary: string;
	summaryFull?: string;
	headings: string[];
	wordCount: number;
	lastModified: number;
	created: number;
	lastIndexed: number;
	contentHash: string;
}

export interface VaultIndex {
	lastIndexed: string;
	documentCount: number;
	documents: Record<string, VaultDocument>;
}

export class VaultIndexer {
	private app: any;
	private index: VaultIndex | null = null;

	private static readonly MAX_CONTENT_CHARS = 32000;
	private static readonly SUMMARY_FULL_THRESHOLD = 10000;

	constructor(app: any) {
		this.app = app;
	}

	getIndex(): VaultIndex | null {
		return this.index;
	}

	async loadIndex(data: any): Promise<void> {
		if (data && data.vaultIndex) {
			this.index = data.vaultIndex;
		}
	}

	getDataForSave(): any {
		return {
			vaultIndex: this.index,
		};
	}

	private generateId(path: string): string {
		let hash = 0;
		for (let i = 0; i < path.length; i++) {
			const char = path.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return Math.abs(hash).toString(36);
	}

	private generateContentHash(content: string): string {
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return Math.abs(hash).toString(36);
	}

	private generateSummary(content: string, maxLength: number = 500): string {
		const lines = content.split("\n").filter((line: string) => line.trim());
		const firstLines = lines.slice(0, 10).join("\n");
		const preview = firstLines.substring(0, maxLength);
		return preview + (firstLines.length > maxLength ? "..." : "");
	}

	private generateSummaryFull(content: string): string {
		if (content.length <= VaultIndexer.SUMMARY_FULL_THRESHOLD) {
			return content;
		}
		return this.generateSummary(content, 2000);
	}

	private extractHeadings(content: string): string[] {
		const headings: string[] = [];
		const lines = content.split("\n");
		for (const line of lines) {
			const match = line.match(/^#{1,6}\s+(.+)/);
			if (match) {
				headings.push(match[1].trim());
			}
		}
		return headings.slice(0, 20);
	}

	private isDocumentStale(file: TFile, doc: VaultDocument): boolean {
		return file.mtime > doc.lastIndexed;
	}

	private async indexDocument(file: TFile): Promise<VaultDocument | null> {
		try {
			const content = await this.app.vault.read(file);
			const summary = this.generateSummary(content);
			const summaryFull = this.generateSummaryFull(content);
			const headings = this.extractHeadings(content);
			const wordCount = content.split(/\s+/).filter(Boolean).length;
			const contentHash = this.generateContentHash(content);

			return {
				id: this.generateId(file.path),
				path: file.path,
				name: file.name,
				basename: file.basename,
				summary: summary,
				summaryFull: summaryFull,
				headings: headings,
				wordCount: wordCount,
				lastModified: file.mtime,
				created: file.ctime,
				lastIndexed: Date.now(),
				contentHash: contentHash,
			};
		} catch (error) {
			console.error(`Error indexing file ${file.path}:`, error);
			return null;
		}
	}

	async indexVault(
		folders: string[] | null,
		onProgress?: (current: number, total: number) => void
	): Promise<VaultIndex> {
		const files = this.app.vault.getFiles().filter((f: TFile) => f.extension === "md");

		const filteredFiles = folders && folders.length > 0
			? files.filter((f: TFile) => {
				const filePath = f.path;
				return folders.some((folder) => {
					if (folder === "/" || folder === "") return true;
					return filePath.startsWith(folder) || filePath.startsWith("/" + folder);
				});
			})
			: files;

		const documents: Record<string, VaultDocument> = {};
		const total = filteredFiles.length;
		let current = 0;

		const existingDocs = this.index?.documents || {};

		for (const file of filteredFiles) {
			const existingDoc = existingDocs[file.path];

			if (existingDoc && !this.isDocumentStale(file, existingDoc)) {
				documents[file.path] = existingDoc;
				current++;
				if (onProgress) {
					onProgress(current, total);
				}
				continue;
			}

			const doc = await this.indexDocument(file);
			if (doc) {
				documents[file.path] = doc;
			}

			current++;
			if (onProgress) {
				onProgress(current, total);
			}
		}

		this.index = {
			lastIndexed: new Date().toISOString(),
			documentCount: Object.keys(documents).length,
			documents: documents,
		};

		return this.index;
	}

	searchByKeyword(query: string): VaultDocument[] {
		if (!this.index) return [];
		const lowerQuery = query.toLowerCase();
		const results: VaultDocument[] = [];

		for (const doc of Object.values(this.index.documents)) {
			if (
				doc.name.toLowerCase().includes(lowerQuery) ||
				doc.summary.toLowerCase().includes(lowerQuery) ||
				doc.path.toLowerCase().includes(lowerQuery)
			) {
				results.push(doc);
			}
		}

		return results.slice(0, 50);
	}

	getDocument(path: string): VaultDocument | null {
		if (!this.index) return null;
		return this.index.documents[path] || null;
	}

	getDocumentContent(path: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			return this.app.vault.read(file);
		}
		return Promise.reject(new Error("File not found"));
	}

	async getDocumentForLLM(path: string): Promise<{ content: string; isTruncated: boolean }> {
		const content = await this.getDocumentContent(path);

		if (content.length > VaultIndexer.MAX_CONTENT_CHARS) {
			const doc = this.getDocument(path);
			if (doc?.summaryFull) {
				return { content: doc.summaryFull, isTruncated: true };
			}
			const summary = this.generateSummary(content, 3000);
			return { content: summary, isTruncated: true };
		}

		return { content, isTruncated: false };
	}

	getAllDocuments(): VaultDocument[] {
		if (!this.index) return [];
		return Object.values(this.index.documents);
	}

	getDocumentsByFolder(folder: string): VaultDocument[] {
		if (!this.index) return [];
		return Object.values(this.index.documents).filter((doc) =>
			doc.path.startsWith(folder) || doc.path.startsWith("/" + folder)
		);
	}

	getDocumentFolder(doc: VaultDocument): string {
		const parts = doc.path.split("/");
		if (parts.length > 1) {
			parts.pop();
			return parts.join("/");
		}
		return "";
	}

	clearIndex(): void {
		this.index = null;
	}

	buildContext(): string {
		const index = this.getIndex();
		if (!index) return "";

		const docs = Object.values(index.documents);
		const contextLines: string[] = [`Vault contains ${docs.length} documents:\n`];

		for (const doc of docs.slice(0, 100)) {
			contextLines.push(`## ${doc.name}`);
			contextLines.push(`Path: ${doc.path}`);
			if (doc.headings.length > 0) {
				contextLines.push(`Headings: ${doc.headings.join(", ")}`);
			}
			contextLines.push(`Preview: ${doc.summary.substring(0, 200)}...`);
			contextLines.push("");
		}

		if (docs.length > 100) {
			contextLines.push(`... and ${docs.length - 100} more documents`);
		}

		return contextLines.join("\n");
	}
}