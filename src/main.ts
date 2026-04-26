import { Plugin, Notice, TFile } from "obsidian";
import { VaultIndexer } from "./vault/VaultIndexer";
import { DocumentModal } from "./views/DocumentModal";
import { VaultAssistantModal } from "./views/VaultAssistantModal";
import { SettingsTab } from "./settings/SettingsTab";

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
		content: `Find all documents related to: {{topic}}
Suggest wikilinks between them using the format [[Document Name|display text]] and explain why they connect.
Create a summary document listing all connections found.`,
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
};

export default class LMStudioCopilotPlugin extends Plugin {
	settings: LmStudioSettings;
	indexer: VaultIndexer;

	async onload() {
		this.indexer = new VaultIndexer(this.app);
		await this.loadSettings();
		this.addSettingTab(new SettingsTab(this.app, this));
		this.registerCommands();
		this.setupRibbon();

		if (this.settings.autoIndexOnStartup) {
			this.scheduleIndexing();
		}
	}

	private setupRibbon() {
		this.addRibbonIcon("file-text", "AI Documents", () => {
			new DocumentModal(this.app, this).open();
		});

		this.addRibbonIcon("brain", "Vault Assistant", () => {
			new VaultAssistantModal(this.app, this).open();
		});
	}

	private registerCommands() {
		this.addCommand({
			id: "open-document-ai",
			name: "Open AI Document Assistant",
			callback: () => new DocumentModal(this.app, this).open(),
		});

		this.addCommand({
			id: "write-new-document",
			name: "Write new document with AI",
			callback: () => new DocumentModal(this.app, this, "write").open(),
		});

		this.addCommand({
			id: "edit-selected-document",
			name: "Edit document with AI",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("No active file");
					return;
				}
				new DocumentModal(this.app, this, "edit", file).open();
			},
		});

		this.addCommand({
			id: "combine-documents",
			name: "Combine selected documents",
			callback: () => new DocumentModal(this.app, this, "combine").open(),
		});

		this.addCommand({
			id: "open-vault-assistant",
			name: "Open Vault Assistant",
			callback: () => new VaultAssistantModal(this.app, this).open(),
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
			const savedVaultTemplateIds = this.settings.vaultTemplates.map((t: any) => t.id);
			for (const defaultTemplate of DEFAULT_VAULT_TEMPLATES) {
				if (!savedVaultTemplateIds.includes(defaultTemplate.id)) {
					this.settings.vaultTemplates.push(defaultTemplate);
				}
			}
			const defaultTemplateIds = DEFAULT_VAULT_TEMPLATES.map((t) => t.id);
			this.settings.vaultTemplates = this.settings.vaultTemplates.filter((t: any) =>
				defaultTemplateIds.includes(t.id)
			);
		}

		if (data?.vaultIndex) {
			await this.indexer.loadIndex(data);
		}
	}

	async saveSettings() {
		const indexData = this.indexer.getDataForSave();
		await this.saveData({ ...this.settings, ...indexData });
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
}