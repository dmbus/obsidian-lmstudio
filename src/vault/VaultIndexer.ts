import { TFile } from "obsidian";

export interface VaultDocument {
	id: string;
	path: string;
	name: string;
	basename: string;
	summary: string;
	headings: string[];
	wordCount: number;
	lastModified: number;
	created: number;
}

export interface VaultIndex {
	lastIndexed: string;
	documentCount: number;
	documents: Record<string, VaultDocument>;
}

export class VaultIndexer {
	private app: any;
	private index: VaultIndex | null = null;

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

		for (const file of filteredFiles) {
			try {
				const content = await this.app.vault.read(file);
				const summary = this.generateSummary(content);
				const headings = this.extractHeadings(content);
				const wordCount = content.split(/\s+/).filter(Boolean).length;

				documents[file.path] = {
					id: this.generateId(file.path),
					path: file.path,
					name: file.name,
					basename: file.basename,
					summary: summary,
					headings: headings,
					wordCount: wordCount,
					lastModified: file.mtime,
					created: file.ctime,
				};
			} catch (error) {
				console.error(`Error indexing file ${file.path}:`, error);
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

	private generateSummary(content: string): string {
		const lines = content.split("\n").filter((line: string) => line.trim());
		const firstLines = lines.slice(0, 10).join("\n");
		const preview = firstLines.substring(0, 500);
		return preview + (firstLines.length > 500 ? "..." : "");
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

	private generateId(path: string): string {
		let hash = 0;
		for (let i = 0; i < path.length; i++) {
			const char = path.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return Math.abs(hash).toString(36);
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

	clearIndex(): void {
		this.index = null;
	}
}