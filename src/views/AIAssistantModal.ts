import { App, Modal, Notice, TFile } from "obsidian";
import LMStudioCopilotPlugin from "../main";

type AssistantScope = "current" | "specific" | "selected" | "all";
type EditMode = "append" | "replace" | "edit";

interface ProposedChange {
	id: string;
	type: "wikilink" | "newdoc" | "edit";
	fromPath?: string;
	toPath?: string;
	filePath?: string;
	originalContent?: string;
	newContent?: string;
	reason: string;
	checked: boolean;
}

export class AIAssistantModal extends Modal {
	plugin: LMStudioCopilotPlugin;

	private statusEl!: HTMLElement;
	private scopeSelect!: HTMLSelectElement;
	private folderInput!: HTMLInputElement;
	private documentInputWrapper!: HTMLDivElement;
	private documentInput!: HTMLInputElement;
	private selectedFile: TFile | null = null;
	
	private modeSection!: HTMLDivElement;
	private modeButtons: HTMLButtonElement[] = [];
	private currentMode: EditMode = "append";
	
	private promptTextarea!: HTMLTextAreaElement;
	private templateSection!: HTMLDivElement;
	private templateSelect!: HTMLSelectElement;
	private variablesContainer!: HTMLDivElement;
	
	private analyzeBtn!: HTMLButtonElement;
	private resultsContainer!: HTMLElement;
	private applyBtn!: HTMLButtonElement;

	private proposedChanges: ProposedChange[] = [];
	private indexing = false;
	private selectedFolders: string[] = [];

	constructor(app: App, plugin: LMStudioCopilotPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { titleEl, contentEl } = this;
		titleEl.textContent = "AI Assistant";
		contentEl.style.cssText = "padding: 20px;";
		contentEl.style.maxHeight = "80vh";
		contentEl.style.overflowY = "auto";

		this.selectedFile = this.app.workspace.getActiveFile();
		this.renderForm(contentEl);
	}

	private renderForm(container: HTMLElement) {
		container.empty();

		const statusSection = container.createDiv();
		statusSection.style.cssText = "margin-bottom: 16px; padding: 12px; background: var(--background-secondary); border-radius: 6px;";
		this.statusEl = statusSection.createDiv();

		const scopeSection = container.createDiv();
		scopeSection.style.cssText = "margin-bottom: 16px;";
		scopeSection
			.createEl("label", { text: "Scope" })
			.style.cssText = "display: block; margin-bottom: 8px; font-weight: 600;";

		this.scopeSelect = scopeSection.createEl("select") as HTMLSelectElement;
		this.scopeSelect.style.cssText =
			"width: 100%; border-radius: 6px; font-size: 14px; background: var(--background-primary) !important; color: var(--text-normal) !important; border: 1px solid var(--background-modifier-border) !important;";
		
		this.scopeSelect.createEl("option", { text: "Current Document", value: "current" });
		this.scopeSelect.createEl("option", { text: "Specific Document", value: "specific" });
		this.scopeSelect.createEl("option", { text: "Selected Folders", value: "selected" });
		this.scopeSelect.createEl("option", { text: "All Vault", value: "all" });
		
		// Default to current if available, else all
		this.scopeSelect.value = this.selectedFile ? "current" : "all";
		this.scopeSelect.addEventListener("change", () => this.onScopeChange());

		// Document Search (for "specific" scope)
		this.documentInputWrapper = scopeSection.createDiv();
		this.documentInputWrapper.style.cssText = "margin-top: 8px; position: relative; display: none;";
		this.documentInput = this.documentInputWrapper.createEl("input", {
			attr: { type: "text", placeholder: "Search documents..." },
		}) as HTMLInputElement;
		this.documentInput.style.cssText = "width: 100%; border-radius: 6px;";
		
		const docDropdown = this.documentInputWrapper.createDiv();
		docDropdown.style.cssText = "position: absolute; top: 100%; left: 0; right: 0; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 6px; max-height: 200px; overflow-y: auto; z-index: 1000; display: none;";
		
		this.documentInput.addEventListener("input", () => this.onDocumentSearch(this.documentInput.value, docDropdown));
		this.documentInput.addEventListener("blur", () => {
			setTimeout(() => (docDropdown.style.display = "none"), 200);
		});

		// Folder Search (for "selected" scope)
		const folderSection = scopeSection.createDiv();
		folderSection.style.cssText = "margin-top: 8px; display: none;";
		folderSection.className = "folder-search-section";

		const folderInputWrapper = folderSection.createDiv();
		folderInputWrapper.style.cssText = "position: relative;";

		this.folderInput = folderInputWrapper.createEl("input", {
			attr: { type: "text", placeholder: "Type to search folders..." },
		}) as HTMLInputElement;
		this.folderInput.style.cssText = "width: 100%; border-radius: 6px;";

		const folderDropdown = folderInputWrapper.createDiv();
		folderDropdown.style.cssText = "position: absolute; top: 100%; left: 0; right: 0; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 6px; max-height: 200px; overflow-y: auto; z-index: 1000; display: none;";
		this.folderInput.addEventListener("input", () => this.onFolderSearch(this.folderInput.value, folderDropdown));
		this.folderInput.addEventListener("blur", () => {
			setTimeout(() => (folderDropdown.style.display = "none"), 200);
		});

		const selectedFoldersDiv = folderSection.createDiv();
		selectedFoldersDiv.style.cssText = "margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px;";
		selectedFoldersDiv.className = "selected-folders-container";

		// Mode Section (for document scope)
		this.modeSection = container.createDiv();
		this.modeSection.style.cssText = "margin-bottom: 16px; display: none;";
		this.modeSection.createEl("label", { text: "Edit Mode" }).style.cssText = "display: block; margin-bottom: 8px; font-weight: 600;";

		const modeButtonGroup = this.modeSection.createDiv();
		modeButtonGroup.style.cssText = "display: flex; gap: 8px;";

		const modes: { mode: EditMode; label: string }[] = [
			{ mode: "edit", label: "Edit" },
			{ mode: "append", label: "Append" },
			{ mode: "replace", label: "Replace" },
		];

		for (const { mode, label } of modes) {
			const btn = modeButtonGroup.createEl("button", { text: label }) as HTMLButtonElement;
			btn.style.cssText = "flex: 1; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; border: 1px solid var(--background-modifier-border); transition: all 0.15s ease;";
			btn.dataset.mode = mode;
			btn.onclick = () => this.onModeButtonClick(mode);
			this.modeButtons.push(btn);
		}

		this.updateModeButtonStyles();

		const promptSection = container.createDiv();
		promptSection.style.cssText = "margin-bottom: 16px;";
		promptSection
			.createEl("label", { text: "Prompt" })
			.style.cssText = "display: block; margin-bottom: 8px; font-weight: 600;";

		this.templateSection = promptSection.createDiv();
		this.templateSection.style.cssText = "margin-bottom: 12px;";
		this.templateSection
			.createEl("label", { text: "Template" })
			.style.cssText = "display: block; margin-bottom: 8px;";

		this.templateSelect = this.templateSection.createEl("select") as HTMLSelectElement;
		this.templateSelect.style.cssText = "width: 100%; border-radius: 6px; font-size: 14px; background: var(--background-primary) !important; color: var(--text-normal) !important; border: 1px solid var(--background-modifier-border) !important;";
		this.templateSelect.addEventListener("change", () => this.onTemplateSelect());

		this.variablesContainer = this.templateSection.createDiv();

		this.promptTextarea = promptSection.createEl("textarea", {
			attr: { placeholder: "Instructions for AI..." },
		}) as HTMLTextAreaElement;
		this.promptTextarea.style.cssText = "width: 100%; height: 120px; border-radius: 6px; resize: vertical;";

		const buttonSection = container.createDiv();
		buttonSection.style.cssText = "margin-bottom: 16px;";

		this.analyzeBtn = buttonSection.createEl("button", { text: "Process" }) as HTMLButtonElement;
		this.analyzeBtn.style.cssText = "width: 100%; padding: 12px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px;";
		this.analyzeBtn.onclick = () => this.onAnalyze();

		this.resultsContainer = container.createDiv();
		this.resultsContainer.style.cssText = "display: none;";

		this.onScopeChange();
	}

	private onScopeChange() {
		if (!this.scopeSelect) return;
		const scope = this.scopeSelect.value as AssistantScope;
		
		// Visibility toggles
		this.documentInputWrapper.style.display = scope === "specific" ? "block" : "none";
		const folderSection = this.contentEl.querySelector(".folder-search-section") as HTMLElement;
		if (folderSection) folderSection.style.display = scope === "selected" ? "block" : "none";
		this.modeSection.style.display = (scope === "current" || scope === "specific") ? "block" : "none";

		// Update Templates
		this.templateSelect.empty();
		this.templateSelect.createEl("option", { text: "Freeform", value: "" });
		
		if (scope === "current" || scope === "specific") {
			for (const t of this.plugin.settings.promptTemplates) {
				this.templateSelect.createEl("option", { text: t.name, value: t.id });
			}
			this.analyzeBtn.textContent = "Generate";
		} else {
			for (const t of this.plugin.settings.vaultTemplates) {
				this.templateSelect.createEl("option", { text: t.name, value: t.id });
			}
			this.analyzeBtn.textContent = "Index Vault & Analyze";
		}

		if (this.templateSelect.options.length > 1) {
			this.templateSelect.selectedIndex = 1;
		} else {
			this.templateSelect.selectedIndex = 0;
		}
		
		this.onTemplateSelect();
		this.updateStatus();
	}

	private onModeButtonClick(mode: EditMode) {
		this.currentMode = mode;
		this.updateModeButtonStyles();
	}

	private updateModeButtonStyles() {
		for (const btn of this.modeButtons) {
			const isActive = btn.dataset.mode === this.currentMode;
			if (isActive) {
				btn.style.cssText += "background: var(--interactive-accent); color: var(--text-on-accent); border-color: var(--interactive-accent);";
			} else {
				btn.style.cssText += "background: var(--background-secondary); color: var(--text-muted); border-color: var(--background-modifier-border);";
			}
		}
	}

	private onDocumentSearch(query: string, dropdown: HTMLElement) {
		if (query.length < 2) {
			dropdown.style.display = "none";
			return;
		}
		const files = this.plugin.searchFiles(query);
		if (files.length === 0) {
			dropdown.style.display = "none";
			return;
		}
		dropdown.style.display = "block";
		dropdown.empty();
		for (const file of files) {
			const item = dropdown.createDiv();
			item.style.cssText = "padding: 10px; cursor: pointer; border-bottom: 1px solid var(--background-modifier-border);";
			item.textContent = file.path;
			item.onclick = () => {
				this.selectedFile = file;
				this.documentInput.value = file.path;
				dropdown.style.display = "none";
				this.updateStatus();
			};
		}
	}

	private onFolderSearch(query: string, dropdown: HTMLElement) {
		if (query.length < 1) {
			dropdown.style.display = "none";
			return;
		}
		const folders = this.getAllFolders();
		const matching = folders.filter((f) => f.toLowerCase().contains(query.toLowerCase())).slice(0, 10);
		if (matching.length === 0) {
			dropdown.style.display = "none";
			return;
		}
		dropdown.style.display = "block";
		dropdown.empty();
		for (const folder of matching) {
			const item = dropdown.createDiv();
			item.style.cssText = "padding: 10px; cursor: pointer; border-bottom: 1px solid var(--background-modifier-border);";
			item.textContent = folder;
			item.onclick = () => {
				this.addSelectedFolder(folder);
				this.folderInput.value = "";
				dropdown.style.display = "none";
			};
		}
	}

	private getAllFolders(): string[] {
		const folders = new Set<string>();
		for (const file of this.app.vault.getFiles()) {
			const parts = file.path.split("/");
			if (parts.length > 1) {
				parts.pop();
				folders.add(parts.join("/"));
			}
		}
		return Array.from(folders).sort();
	}

	private addSelectedFolder(folder: string) {
		if (this.selectedFolders.includes(folder)) return;
		this.selectedFolders.push(folder);
		const container = this.contentEl.querySelector(".selected-folders-container") as HTMLElement;
		if (container) {
			const chip = container.createDiv();
			chip.style.cssText = "display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: var(--interactive-accent); color: var(--text-on-accent); border-radius: 4px; font-size: 0.85em;";
			chip.textContent = folder;
			const removeBtn = chip.createEl("button", { text: "×" });
			removeBtn.style.cssText = "background: none; border: none; color: inherit; cursor: pointer; padding: 0; margin-left: 4px; font-size: 1.2em;";
			removeBtn.onclick = () => {
				this.selectedFolders = this.selectedFolders.filter(f => f !== folder);
				chip.remove();
			};
		}
	}

	private onTemplateSelect() {
		const templateId = this.templateSelect.value;
		this.variablesContainer.empty();
		if (!templateId) {
			this.promptTextarea.value = "";
			return;
		}
		const scope = this.scopeSelect.value as AssistantScope;
		const templates = (scope === "current" || scope === "specific") 
			? this.plugin.settings.promptTemplates 
			: this.plugin.settings.vaultTemplates;
		
		const template = templates.find(t => t.id === templateId);
		if (template) {
			this.promptTextarea.value = template.content;
			this.renderTemplateVariables(template.content);
		}
	}

	private renderTemplateVariables(content: string) {
		this.variablesContainer.empty();
		const matches = content.match(/\{\{(\w+)\}\}/g) || [];
		const seen = new Set<string>();
		const autoFilledVars = new Set(["content"]);
		for (const match of matches) {
			const varName = match.replace(/\{\{|\}\}/g, "");
			if (seen.has(varName)) continue;
			seen.add(varName);
			if (autoFilledVars.has(varName)) continue;
			const varContainer = this.variablesContainer.createDiv();
			varContainer.style.cssText = "margin-bottom: 8px;";
			varContainer.createEl("label", { text: varName }).style.cssText = "display: block; margin-bottom: 4px; font-size: 0.9em;";
			const input = varContainer.createEl("input", { attr: { type: "text" } }) as HTMLInputElement;
			input.style.cssText = "width: 100%; padding: 8px; border-radius: 4px;";
			if (varName === "date") input.value = new Date().toISOString().split("T")[0];
			if (varName === "title" && this.selectedFile) input.value = this.selectedFile.basename;
		}
	}

	private updateStatus() {
		if (!this.scopeSelect) return;
		const scope = this.scopeSelect.value as AssistantScope;
		if (scope === "current" || scope === "specific") {
			if (this.selectedFile) {
				this.statusEl.textContent = `Target: ${this.selectedFile.path}`;
				this.statusEl.style.color = "var(--text-accent)";
			} else {
				this.statusEl.textContent = "No document selected";
				this.statusEl.style.color = "var(--text-error)";
			}
			return;
		}
		const index = this.plugin.indexer ? this.plugin.indexer.getIndex() : null;
		if (this.indexing) {
			this.statusEl.textContent = "Indexing...";
		} else if (index) {
			this.statusEl.textContent = `Ready: ${index.documentCount} docs | Last: ${new Date(index.lastIndexed).toLocaleTimeString()}`;
			this.statusEl.style.color = "var(--text-normal)";
		} else {
			this.statusEl.textContent = "Not indexed";
		}
	}

	private async onAnalyze() {
		let prompt = this.promptTextarea.value.trim();
		if (!prompt) {
			new Notice("Please enter a prompt");
			return;
		}

		const scope = this.scopeSelect.value as AssistantScope;

		const variables: Record<string, string> = {};
		for (const container of Array.from(this.variablesContainer.children)) {
			const label = container.querySelector("label")?.textContent || "";
			const input = container.querySelector("input")?.value || "";
			if (label) variables[label] = input;
		}

		if (scope === "current" && this.selectedFile) {
			if (!variables["content"] || variables["content"].trim() === "") {
				const content = await this.plugin.indexer.getDocumentContent(this.selectedFile.path);
				variables["content"] = content;
			}
		}

		if (Object.keys(variables).length > 0) {
			prompt = this.plugin.substituteTemplate(prompt, variables);
		}

		if (scope === "current" || scope === "specific") {
			if (!this.selectedFile && scope === "specific") {
				new Notice("Please select a document first");
				return;
			}
			const mode = this.currentMode;
			const filename = this.selectedFile ? this.selectedFile.name : this.plugin.settings.defaultFilename;
			this.plugin.jobQueueManager.addJob("generate", {
				prompt,
				filename,
				mode,
				selectedFile: this.selectedFile || undefined,
			} as any);
			new Notice("Generation job added");
		} else {
			const folders = scope === "selected" ? this.selectedFolders : null;
			const templateId = this.templateSelect.value;
			if (templateId === "summarize-all") {
				this.plugin.jobQueueManager.addJob("summarize", { folders });
				new Notice("Summarize job added");
			} else {
				this.plugin.jobQueueManager.addJob("analyze", { prompt, folders, templateId });
				new Notice("Analyze job added");
			}
		}
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}