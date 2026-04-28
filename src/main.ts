import { Plugin, Notice, TFile } from "obsidian";
import { VaultIndexer } from "./vault/VaultIndexer";
import { SummaryCache, SummaryCacheService, VaultSummaryCache } from "./vault/SummaryCache";
import { AIAssistantModal } from "./views/AIAssistantModal";
import { SettingsTab } from "./settings/SettingsTab";
import { JobQueueManager } from "./jobs/JobQueueManager";
import { JobHistoryModal } from "./jobs/JobHistoryModal";

interface PromptTemplate {
	id: string;
	name: string;
	content: string;
}

interface VaultTemplate {
	id: string;
	name: string;
	content: string;
}

interface LmStudioSettings {
	lmStudioUrl: string;
	lmStudioModel: string;
	outputFolder: string;
	outputLocation: "current" | "specific";
	newNotePrefix: string;
	defaultFilename: string;
	maxSearchResults: number;
	systemPrompt: string;
	promptTemplates: PromptTemplate[];
	logLevel: string;
	autoIndexOnStartup: boolean;
	periodicReindex: "off" | "daily" | "weekly";
	indexFolders: string[];
	vaultTemplates: VaultTemplate[];
	summaryCacheMaxSize: number;
	summaryCacheExpirationDays: number;
}

const DEFAULT_SYSTEM_PROMPT = `You are assisting with Obsidian vault documents. Rules:
- Never delete or overwrite existing content without explicit user permission
- Preserve document structure and formatting
- Only modify content explicitly requested by the user
- If instructions are ambiguous, ask for clarification rather than assume
- Always output valid markdown`;

const DEFAULT_DOCUMENT_TEMPLATES: PromptTemplate[] = [
	{
		id: "meeting-notes",
		name: "Meeting Notes",
		content: `# Meeting: {{title}}

**Date:** {{date}}
**Attendees:** {{attendees}}

## Agenda
{{agenda}}

## Discussion
{{discussion}}

## Action Items
- [ ]
`,
	},
	{
		id: "summary",
		name: "Summary",
		content: `Summarize the following content concisely:

{{content}}`,
	},
	{
		id: "expand",
		name: "Expand",
		content: `Expand the following content with more detail:

{{content}}`,
	},
];

const DEFAULT_VAULT_TEMPLATES: VaultTemplate[] = [
	{
		id: "find-connections",
		name: "Find Connections",
		content: `Analyze the documents in the current scope to find meaningful connections.
Identify instances where one document mentions topics, concepts, or entities that are the primary subject of another document.
For example, if one document discusses "AI Engineering" and there is another note titled "AI Engineering", suggest a link.
Suggest wikilinks between them using the format [[Document Name|display text]] and explain why they connect.
Focus on creating a network of related thoughts across the vault.`,
	},
	{
		id: "answer-question",
		name: "Answer Question",
		content: `Based on the vault content, answer this question: {{question}}
Provide specific document references with [[Document Name|display text]] where relevant.`,
	},
	{
		id: "restructure",
		name: "Restructure Vault",
		content: `Analyze the current vault structure and content.
Propose a new folder organization that groups related documents together.
Create a detailed restructure plan document with specific file movements needed.`,
	},
	{
		id: "summarize-all",
		name: "Summarize Vault",
		content: `Analyze all documents in the provided vault index.
Create a comprehensive summary that combines key points from all documents.
Group related information and suggest meaningful wikilinks between connected documents using [[Document Name|display text]] format.`,
	},
];

const DEFAULT_SETTINGS: LmStudioSettings = {
	lmStudioUrl: "http://127.0.0.1:1234/v1",
	lmStudioModel: "local-model",
	outputFolder: "AI Generated",
	outputLocation: "specific",
	newNotePrefix: "",
	defaultFilename: "untitled.md",
	maxSearchResults: 5,
	systemPrompt: DEFAULT_SYSTEM_PROMPT,
	promptTemplates: DEFAULT_DOCUMENT_TEMPLATES,
	autoIndexOnStartup: true,
	periodicReindex: "off",
	indexFolders: [],
	vaultTemplates: DEFAULT_VAULT_TEMPLATES,
	logLevel: "INFO",
	summaryCacheMaxSize: 1000,
	summaryCacheExpirationDays: 90,
};

export default class LMStudioCopilotPlugin extends Plugin {
	settings: LmStudioSettings;
	indexer: VaultIndexer;
	jobQueueManager!: JobQueueManager;
	private statusBarEl: HTMLElement | null = null;
	private jobStatusEl: HTMLElement | null = null;
	private summaryCache: SummaryCache;
	private summaryCacheService: SummaryCacheService;

	async onload() {
		this.indexer = new VaultIndexer(this.app);
		this.summaryCacheService = new SummaryCacheService();
		this.summaryCache = this.summaryCacheService.createEmptyCache();
		await this.loadSettings();

		this.jobQueueManager = new JobQueueManager(this);
		await this.jobQueueManager.loadState();
		this.registerStatusBar();

		this.addSettingTab(new SettingsTab(this.app, this));
		this.registerCommands();
		this.setupRibbon();

		if (this.settings.autoIndexOnStartup) {
			this.scheduleIndexing();
		}
	}

	private registerStatusBar(): void {
		this.statusBarEl = this.addStatusBarItem();
		this.jobStatusEl = this.statusBarEl.createEl("div", {
			cls: "job-queue-status",
		});
		this.jobStatusEl.style.cssText = "cursor: pointer; padding: 4px 8px; border-radius: 4px;";
		this.jobStatusEl.onclick = () => {
			new JobHistoryModal(this.app, this.jobQueueManager).open();
		};

		this.jobQueueManager.onStatusChange((jobs) => {
			this.updateStatusBar(jobs);
		});

		this.updateStatusBar(this.jobQueueManager.getDisplayJobs());
	}

	private updateStatusBar(jobs: any[]): void {
		if (!this.jobStatusEl) return;

		const runningJob = jobs.find((j) => j.status === "running");
		const pendingCount = jobs.filter((j) => j.status === "pending").length;
		const hasErrors = jobs.some((j) => j.status === "failed");

		if (runningJob) {
			const progress = runningJob.progress?.message || runningJob.description;
			if (pendingCount > 0) {
				this.jobStatusEl.textContent = `🤖 ${progress} (+${pendingCount} queued)`;
			} else {
				this.jobStatusEl.textContent = `🤖 ${progress}`;
			}
			this.jobStatusEl.style.color = "var(--text-accent)";
		} else if (pendingCount > 0) {
			this.jobStatusEl.textContent = `📋 ${pendingCount} job${pendingCount > 1 ? "s" : ""} queued`;
			this.jobStatusEl.style.color = "var(--text-muted)";
		} else if (hasErrors) {
			this.jobStatusEl.textContent = "⚠️ Job failed";
			this.jobStatusEl.style.color = "var(--text-error)";
		} else {
			this.jobStatusEl.textContent = "";
			this.jobStatusEl.style.display = "none";
		}

		if (this.jobStatusEl.textContent) {
			this.jobStatusEl.style.display = "inline-flex";
		}
	}

	private setupRibbon() {
		this.addRibbonIcon("brain", "AI Assistant", () => {
			new AIAssistantModal(this.app, this).open();
		});
	}

	private registerCommands() {
		this.addCommand({
			id: "open-ai-assistant",
			name: "Open AI Assistant",
			callback: () => new AIAssistantModal(this.app, this).open(),
		});

		this.addCommand({
			id: "reindex-vault",
			name: "Re-index vault",
			callback: async () => {
				new Notice("Starting vault re-indexing...");
				try {
					await this.indexVault();
					new Notice("Vault re-indexing complete!");
				} catch (error) {
					new Notice(`Indexing failed: ${error}`);
				}
			},
		});
	}

	private scheduleIndexing() {
		if (this.settings.periodicReindex === "off") return;

		this.registerInterval(
			window.setInterval(async () => {
				await this.indexVault();
			}, this.settings.periodicReindex === "daily" ? 86400000 : 604800000)
		);
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data || {});

		if (!this.settings.promptTemplates || this.settings.promptTemplates.length === 0) {
			this.settings.promptTemplates = DEFAULT_DOCUMENT_TEMPLATES;
		}

		if (!this.settings.vaultTemplates || this.settings.vaultTemplates.length === 0) {
			this.settings.vaultTemplates = DEFAULT_VAULT_TEMPLATES;
		} else {
			// Update existing default templates to latest content, and add missing ones
			const updatedTemplates = [...this.settings.vaultTemplates];
			for (const defaultTemplate of DEFAULT_VAULT_TEMPLATES) {
				const existingIndex = updatedTemplates.findIndex(t => t.id === defaultTemplate.id);
				if (existingIndex !== -1) {
					// Update default template content if it hasn't been heavily customized (optional check)
					// For now, let's force update the defaults to match the new requirements
					updatedTemplates[existingIndex] = { ...defaultTemplate };
				} else {
					updatedTemplates.push(defaultTemplate);
				}
			}
			
			// Filter to only include templates that are in defaults or were manually added (if any were)
			// But the current logic seems to want to stick strictly to defaults
			const defaultTemplateIds = DEFAULT_VAULT_TEMPLATES.map((t) => t.id);
			this.settings.vaultTemplates = updatedTemplates.filter((t: any) =>
				defaultTemplateIds.includes(t.id)
			);
		}

		if (data?.vaultIndex) {
			await this.indexer.loadIndex(data);
		}

		if (data?.summaryCache) {
			this.summaryCache = data.summaryCache;
		} else {
			this.summaryCache = this.summaryCacheService.createEmptyCache();
		}

		this.summaryCache = this.summaryCacheService.createEmptyCache();

		this.summaryCacheService.pruneExpired(this.summaryCache, this.settings.summaryCacheExpirationDays);
		this.summaryCacheService.pruneToSize(this.summaryCache, this.settings.summaryCacheMaxSize);
	}

	async saveSettings() {
		const indexData = this.indexer.getDataForSave();
		await this.saveData({ ...this.settings, ...indexData, summaryCache: this.summaryCache });
	}

	async testConnection(): Promise<boolean> {
		try {
			const response = await fetch(`${this.settings.lmStudioUrl}/models`, {
				method: "GET",
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	async complete(prompt: string): Promise<string> {
		const MAX_PROMPT_LENGTH = 100000;
		const safePrompt = prompt.slice(0, MAX_PROMPT_LENGTH);

		const response = await fetch(`${this.settings.lmStudioUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": "Bearer lm-studio",
			},
			body: JSON.stringify({
				model: this.settings.lmStudioModel,
				messages: [
					{ role: "system", content: this.settings.systemPrompt },
					{ role: "user", content: safePrompt },
				],
				max_tokens: 4096,
				temperature: 0.8,
			}),
		});

		if (!response.ok) {
			throw new Error(`LM Studio error: ${response.status}`);
		}

		const data = await response.json();
		let content = data.choices?.[0]?.message?.content || "";

		content = content.replace(/^```markdown\s*/i, '');
		content = content.replace(/^```\s*/i, '');
		content = content.replace(/\s*```$/i, '');

		return content;
	}

	async indexVault(folders?: string[] | null, onProgress?: (current: number, total: number) => void): Promise<void> {
		const effectiveFolders = folders !== undefined ? folders : (this.settings.indexFolders.length > 0 ? this.settings.indexFolders : null);
		await this.indexer.indexVault(effectiveFolders, onProgress);
		await this.saveSettings();
	}

	searchFiles(query: string): TFile[] {
		if (!query || query.length < 2) return [];
		const lower = query.toLowerCase();
		return this.app.vault
			.getFiles()
			.filter((f: TFile) => f.extension === "md" && f.name.toLowerCase().contains(lower))
			.slice(0, this.settings.maxSearchResults);
	}

	async createNote(content: string, filename: string): Promise<TFile | null> {
		const sanitizePath = (path: string): string => {
			return path.replace(/\.\./g, "").replace(/^\//, "");
		};

		const sanitizedFilename = sanitizePath(filename);
		if (!sanitizedFilename || !sanitizedFilename.endsWith(".md")) {
			new Notice("Invalid filename");
			return null;
		}

		let folder = "";
		if (this.settings.outputLocation === "specific") {
			folder = sanitizePath(this.settings.outputFolder);
		}

		let fullPath: string;
		if (folder) {
			const folderPath = `/${folder}`;
			fullPath = folderPath.endsWith("/") ? folderPath + sanitizedFilename : folderPath + "/" + sanitizedFilename;

			try {
				const folderExists = this.app.vault.getAbstractFileByPath(folderPath);
				if (!folderExists) {
					await this.app.vault.createFolder(folderPath);
				}
			} catch (e) {
				console.warn("Could not create folder:", e);
			}
		} else {
			fullPath = "/" + sanitizedFilename;
		}

		try {
			const existing = this.app.vault.getAbstractFileByPath(fullPath);
			if (existing) {
				await this.app.vault.modify(existing as TFile, content);
				return existing as TFile;
			}
			return await this.app.vault.create(fullPath, content);
		} catch (error) {
			const altPath = `/${sanitizedFilename}`;
			try {
				const existing = this.app.vault.getAbstractFileByPath(altPath);
				if (existing) {
					await this.app.vault.modify(existing as TFile, content);
					return existing as TFile;
				}
				return await this.app.vault.create(altPath, content);
			} catch (e) {
				new Notice(`Error creating note: ${e}`);
				return null;
			}
		}
	}

	async appendToNote(content: string, file: TFile): Promise<TFile | null> {
		try {
			const existing = await this.app.vault.read(file);
			const combined = existing + "\n\n" + content;
			await this.app.vault.modify(file, combined);
			return file;
		} catch (error) {
			new Notice(`Error appending to note: ${error}`);
			return null;
		}
	}

	substituteTemplate(template: string, variables: Record<string, string>): string {
		let result = template;
		for (const [key, value] of Object.entries(variables)) {
			const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), escapedValue);
		}
		return result;
	}

	addPromptTemplate(template: PromptTemplate) {
		this.settings.promptTemplates.push(template);
		this.saveSettings();
	}

	updatePromptTemplate(id: string, updates: Partial<PromptTemplate>) {
		const template = this.settings.promptTemplates.find((t) => t.id === id);
		if (template) {
			Object.assign(template, updates);
			this.saveSettings();
		}
	}

	deletePromptTemplate(id: string) {
		this.settings.promptTemplates = this.settings.promptTemplates.filter(
			(t) => t.id !== id
		);
		this.saveSettings();
	}

	addVaultTemplate(template: VaultTemplate) {
		this.settings.vaultTemplates.push(template);
		this.saveSettings();
	}

	updateVaultTemplate(id: string, updates: Partial<VaultTemplate>) {
		const template = this.settings.vaultTemplates.find((t) => t.id === id);
		if (template) {
			Object.assign(template, updates);
			this.saveSettings();
		}
	}

	deleteVaultTemplate(id: string) {
		this.settings.vaultTemplates = this.settings.vaultTemplates.filter(
			(t) => t.id !== id
		);
		this.saveSettings();
	}

	async insertWikilink(file: TFile, linkText: string, displayText?: string): Promise<void> {
		const link = displayText ? `[[${linkText}|${displayText}]]` : `[[${linkText}]]`;
		const content = await this.app.vault.read(file);
		await this.app.vault.modify(file, content + "\n" + link);
	}

	getSummaryCache(): SummaryCache {
		return this.summaryCache;
	}

	updateIndividualSummaryCache(documentPath: string, contentHash: string, summary: string): void {
		this.summaryCache.individualSummaries[documentPath] = {
			documentPath,
			contentHash,
			summary,
			generatedAt: Date.now(),
		};
	}

	updateFolderSummaryCache(folderPath: string, contentHashes: string[], summaryHash: string, summary: string): void {
		this.summaryCache.folderSummaries[folderPath] = {
			folderPath,
			contentHashes: [...contentHashes],
			summaryHash,
			summary,
			generatedAt: Date.now(),
		};
	}

	updateVaultSummaryCache(folderSummaryHashes: string[], summary: string): void {
		this.summaryCache.vaultSummary = {
			folderSummaryHashes: [...folderSummaryHashes],
			summary,
			generatedAt: Date.now(),
		};
	}

	isIndividualSummaryCacheValid(documentPath: string, currentContentHash: string): boolean {
		const cached = this.summaryCache.individualSummaries[documentPath];
		return this.summaryCacheService.isIndividualCacheValid(
			cached,
			currentContentHash,
			this.settings.summaryCacheExpirationDays
		);
	}

	canUseCachedFolderSummary(folderPath: string, currentHashes: string[]): boolean {
		const cached = this.summaryCache.folderSummaries[folderPath];
		return this.summaryCacheService.canUseCachedFolderSummary(
			cached,
			currentHashes,
			this.settings.summaryCacheExpirationDays
		);
	}

	canUseCachedVaultSummary(folderSummaryHashes: string[]): boolean {
		return this.summaryCacheService.canUseCachedVaultSummary(
			this.summaryCache.vaultSummary,
			folderSummaryHashes,
			this.settings.summaryCacheExpirationDays
		);
	}

	generateSummaryHash(content: string): string {
		return this.summaryCacheService.generateHash(content);
	}

	clearSummaryCache(): void {
		this.summaryCache = this.summaryCacheService.createEmptyCache();
		this.saveSettings();
	}
}