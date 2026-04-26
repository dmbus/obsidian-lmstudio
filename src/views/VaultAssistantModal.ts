import { App, Modal, Notice, TFile } from "obsidian";
import LMStudioCopilotPlugin from "../main";

type VaultTemplateMode = "freeform" | "template";

interface ProposedChange {
	id: string;
	type: "wikilink" | "newdoc" | "move";
	fromPath?: string;
	toPath?: string;
	reason: string;
	checked: boolean;
	content?: string;
}

export class VaultAssistantModal extends Modal {
	plugin: LMStudioCopilotPlugin;

	private statusEl!: HTMLElement;
	private scopeSelect!: HTMLSelectElement;
	private folderInput!: HTMLInputElement;
	private promptTextarea!: HTMLTextAreaElement;
	private templateSelect!: HTMLSelectElement;
	private templateTextarea!: HTMLTextAreaElement;
	private variablesContainer!: HTMLDivElement;
	private analyzeBtn!: HTMLButtonElement;
	private resultsContainer!: HTMLDivElement;
	private applyBtn!: HTMLButtonElement;

	private promptMode: VaultTemplateMode = "freeform";
	private proposedChanges: ProposedChange[] = [];
	private indexing = false;

	constructor(app: App, plugin: ObsidianLMStudioPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { titleEl, contentEl } = this;
		titleEl.textContent = "Vault Assistant";
		contentEl.style.cssText = "padding: 20px;";
		contentEl.style.maxHeight = "80vh";
		contentEl.style.overflowY = "auto";

		this.renderForm(contentEl);
	}

	private renderForm(container: HTMLElement) {
		container.empty();

		const statusSection = container.createDiv();
		statusSection.style.cssText = "margin-bottom: 16px; padding: 12px; background: var(--background-secondary); border-radius: 6px;";
		this.statusEl = statusSection.createDiv();
		this.updateStatus();

		const scopeSection = container.createDiv();
		scopeSection.style.cssText = "margin-bottom: 16px;";
		scopeSection
			.createEl("label", { text: "Scope" })
			.style.cssText = "display: block; margin-bottom: 8px; font-weight: 600;";

		this.scopeSelect = scopeSection.createEl("select") as HTMLSelectElement;
		this.scopeSelect.style.cssText =
			"width: 100%; padding: 12px; border-radius: 6px; font-size: 14px; background: var(--background-primary) !important; color: var(--text-normal) !important; border: 1px solid var(--background-modifier-border) !important;";
		this.scopeSelect.add(new Option("All Vault", "all"));
		this.scopeSelect.add(new Option("Selected Folders", "selected"));
		this.scopeSelect.value = "all";
		this.scopeSelect.addEventListener("change", () => {
			const folderSection = container.querySelector(".folder-search-section") as HTMLElement;
			if (folderSection) {
				folderSection.style.display = this.scopeSelect.value === "selected" ? "block" : "none";
			}
		});

		const folderSection = scopeSection.createDiv();
		folderSection.style.cssText = "margin-top: 8px; display: none;";
		folderSection.className = "folder-search-section";

		const folderInputWrapper = folderSection.createDiv();
		folderInputWrapper.style.cssText = "position: relative;";

		this.folderInput = folderInputWrapper.createEl("input", {
			attr: { type: "text", placeholder: "Type to search folders..." },
		}) as HTMLInputElement;
		this.folderInput.style.cssText =
			"width: 100%; padding: 12px; border-radius: 6px;";

		const folderDropdown = folderInputWrapper.createDiv();
		folderDropdown.style.cssText =
			"position: absolute; top: 100%; left: 0; right: 0; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 6px; max-height: 200px; overflow-y: auto; z-index: 1000; display: none;";
		this.folderInput.addEventListener("input", () => this.onFolderSearch(this.folderInput.value, folderDropdown));
		this.folderInput.addEventListener("blur", () => {
			setTimeout(() => (folderDropdown.style.display = "none"), 200);
		});

		const selectedFoldersDiv = folderSection.createDiv();
		selectedFoldersDiv.style.cssText = "margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px;";
		selectedFoldersDiv.className = "selected-folders-container";

		const selectedFolders = this.plugin.settings.indexFolders;
		for (const folder of selectedFolders) {
			this.addFolderChip(selectedFoldersDiv, folder);
		}

		this.scopeSelect.value = this.plugin.settings.indexFolders.length > 0 ? "selected" : "all";
		if (this.plugin.settings.indexFolders.length > 0) {
			folderSection.style.display = "block";
		}

		const promptSection = container.createDiv();
		promptSection.style.cssText = "margin-bottom: 16px;";
		promptSection
			.createEl("label", { text: "Prompt" })
			.style.cssText = "display: block; margin-bottom: 8px; font-weight: 600;";

		const templateSection = promptSection.createDiv();
		templateSection.style.cssText = "margin-bottom: 12px;";
		templateSection
			.createEl("label", { text: "Template" })
			.style.cssText = "display: block; margin-bottom: 8px;";

		this.templateSelect = templateSection.createEl("select") as HTMLSelectElement;
		this.templateSelect.style.cssText =
			"width: 100%; padding: 12px; border-radius: 6px; font-size: 14px; background: var(--background-primary) !important; color: var(--text-normal) !important; border: 1px solid var(--background-modifier-border) !important;";
		this.templateSelect.add(new Option("Freeform", ""));
		for (const t of this.plugin.settings.vaultTemplates) {
			this.templateSelect.add(new Option(t.name, t.id));
		}
		this.templateSelect.addEventListener("change", () => this.onTemplateSelect());

		this.variablesContainer = templateSection.createDiv();

		this.promptTextarea = promptSection.createEl("textarea", {
			attr: { placeholder: "Find all related documents and create backlinks between them..." },
		}) as HTMLTextAreaElement;
		this.promptTextarea.style.cssText =
			"width: 100%; height: 120px; padding: 12px; border-radius: 6px; resize: vertical;";
		this.promptTextarea.value = "";

		const buttonSection = container.createDiv();
		buttonSection.style.cssText = "margin-bottom: 16px;";

		this.analyzeBtn = buttonSection.createEl("button", { text: "Index Vault & Analyze" }) as HTMLButtonElement;
		this.analyzeBtn.style.cssText =
			"width: 100%; padding: 12px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px;";
		this.analyzeBtn.onclick = () => this.onAnalyze();

		this.resultsContainer = container.createDiv();
		this.resultsContainer.style.cssText = "display: none;";
	}

	private updateStatus() {
		const index = this.plugin.indexer.getIndex();
		if (this.indexing) {
			this.statusEl.textContent = "Indexing...";
			return;
		}
		if (index) {
			const date = new Date(index.lastIndexed);
			const timeAgo = this.getTimeAgo(date);
			this.statusEl.textContent = `Ready: ${index.documentCount} docs | Last indexed: ${timeAgo}`;
		} else {
			this.statusEl.textContent = "Not indexed";
		}
	}

	private getTimeAgo(date: Date): string {
		const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
		if (seconds < 60) return "just now";
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes} min ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours} hours ago`;
		const days = Math.floor(hours / 24);
		return `${days} days ago`;
	}

	private onFolderSearch(query: string, dropdown: HTMLElement) {
		if (query.length < 1) {
			dropdown.style.display = "none";
			return;
		}

		const folders = this.getAllFolders();
		const lowerQuery = query.toLowerCase();
		const matching = folders.filter((f) => f.toLowerCase().contains(lowerQuery)).slice(0, 10);

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
			item.onmouseenter = () => {
				item.style.background = "var(--background-modifier-border)";
			};
			item.onmouseleave = () => {
				item.style.background = "";
			};
			item.onclick = () => {
				this.addSelectedFolder(folder);
				this.folderInput.value = "";
				dropdown.style.display = "none";
			};
		}
	}

	private getAllFolders(): string[] {
		const folders = new Set<string>();
		const files = this.app.vault.getFiles();

		for (const file of files) {
			const pathParts = file.path.split("/");
			if (pathParts.length > 1) {
				pathParts.pop();
				folders.add(pathParts.join("/"));
			}
		}

		return Array.from(folders).sort();
	}

	private addSelectedFolder(folder: string) {
		if (this.plugin.settings.indexFolders.includes(folder)) return;

		this.plugin.settings.indexFolders.push(folder);
		this.saveSettings();

		const selectedDiv = this.contentEl.querySelector(".selected-folders-container") as HTMLElement;
		if (selectedDiv) {
			this.addFolderChip(selectedDiv, folder);
		}
	}

	private addFolderChip(container: HTMLElement, folder: string) {
		const chip = container.createDiv();
		chip.style.cssText = "display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: var(--interactive-accent); color: var(--text-on-accent); border-radius: 4px; font-size: 0.85em;";
		chip.textContent = folder;

		const removeBtn = chip.createEl("button", { text: "×" });
		removeBtn.style.cssText = "background: none; border: none; color: inherit; cursor: pointer; padding: 0; margin-left: 4px; font-size: 1.2em; line-height: 1;";
		removeBtn.onclick = () => {
			this.plugin.settings.indexFolders = this.plugin.settings.indexFolders.filter((f) => f !== folder);
			this.saveSettings();
			chip.remove();
		};
	}

	private async saveSettings() {
		await this.plugin.saveSettings();
	}

	private onTemplateSelect() {
		const templateId = this.templateSelect.value;
		this.variablesContainer.empty();

		if (!templateId) {
			this.promptTextarea.value = "";
			return;
		}

		const template = this.plugin.settings.vaultTemplates.find((t) => t.id === templateId);
		if (template) {
			this.promptTextarea.value = template.content;
			this.renderTemplateVariables(template.content);
		}
	}

	private renderTemplateVariables(content: string) {
		this.variablesContainer.empty();
		const matches = content.match(/\{\{(\w+)\}\}/g) || [];
		const seen = new Set<string>();

		for (const match of matches) {
			const varName = match.replace(/\{\{|\}\}/g, "");
			if (seen.has(varName)) continue;
			seen.add(varName);

			const varContainer = this.variablesContainer.createDiv();
			varContainer.style.cssText = "margin-bottom: 8px;";

			varContainer
				.createEl("label", { text: varName })
				.style.cssText = "display: block; margin-bottom: 4px; font-size: 0.9em;";

			const input = varContainer.createEl("input", { attr: { type: "text" } }) as HTMLInputElement;
			input.style.cssText = "width: 100%; padding: 8px; border-radius: 4px;";

			if (varName === "date") {
				input.value = new Date().toISOString().split("T")[0];
			}
		}
	}

	private async onAnalyze() {
		let prompt = this.promptTextarea.value.trim();
		if (!prompt) {
			new Notice("Please enter a prompt");
			return;
		}

		if (this.templateSelect.value) {
			const variables: Record<string, string> = {};

			const children = this.variablesContainer.children;
			for (let i = 0; i < children.length; i++) {
				const container = children[i] as HTMLElement;
				const label = container.querySelector("label");
				const input = container.querySelector("input") as HTMLInputElement;
				const varName = label?.textContent?.trim() || "";
				const varValue = input?.value?.trim() || "";
				if (varName) {
					variables[varName] = varValue;
				}
			}

			const unfilledVars = Object.entries(variables).filter(([, v]) => !v).map(([k]) => k);
			if (unfilledVars.length > 0) {
				new Notice(`Please fill in: ${unfilledVars.join(", ")}`);
				return;
			}

			if (Object.keys(variables).length > 0) {
				prompt = this.plugin.substituteTemplate(prompt, variables);
				this.promptTextarea.value = prompt;
			}
		}

		this.indexing = true;
		this.updateStatus();
		this.analyzeBtn.textContent = "Indexing...";
		this.analyzeBtn.setAttribute("disabled", "true");

		try {
			const scope = this.scopeSelect.value;
			const folders = scope === "selected" ? this.plugin.settings.indexFolders : null;
			await this.plugin.indexVault(folders, (current, total) => {
				this.statusEl.textContent = `Indexing: ${current}/${total}`;
			});

			const index = this.plugin.indexer.getIndex();
			if (!index) {
				throw new Error("Index is empty");
			}

			const templateId = this.templateSelect.value;
			if (templateId === "summarize-all" || templateId === "find-connections") {
				await this.processSummarizeAll(folders);
			} else {
				this.statusEl.textContent = `Analyzing ${index.documentCount} documents...`;
				const context = this.buildContext();
				const fullPrompt = `${context}\n\nUser request: ${prompt}\n\nProvide your response with specific document references using [[Document Name|display text]] format.`;

				const result = await this.plugin.complete(fullPrompt);
				this.proposedChanges = this.parseProposedChanges(result);
				this.displayResults();
			}

		} catch (error) {
			new Notice(`Error: ${error}`);
			console.error(error);
		} finally {
			this.indexing = false;
			this.analyzeBtn.textContent = "Index Vault & Analyze";
			this.analyzeBtn.removeAttribute("disabled");
			this.updateStatus();
		}
	}

	private buildContext(): string {
		const index = this.plugin.indexer.getIndex();
		if (!index) return "";

		const docs = Object.values(index.documents);
		const contextLines = [`Vault contains ${docs.length} documents:\n`];

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

	private async processSummarizeAll(folders: string[] | null): Promise<void> {
		const MAX_CONTENT_LENGTH = 10000;

		const index = this.plugin.indexer.getIndex();
		if (!index) {
			throw new Error("Index is empty");
		}

		let allDocs = Object.values(index.documents);

		if (folders && folders.length > 0) {
			allDocs = allDocs.filter((doc: any) =>
				folders.some((folder: string) =>
					doc.path.startsWith(folder) || doc.path.startsWith("/" + folder)
				)
			);
		}

		if (allDocs.length === 0) {
			new Notice("No documents found");
			return;
		}

		const folderGroups = new Map<string, any[]>();
		for (const doc of allDocs) {
			const folderPath = doc.path.includes("/") ? doc.path.substring(0, doc.path.lastIndexOf("/")) : "";
			if (!folderGroups.has(folderPath)) {
				folderGroups.set(folderPath, []);
			}
			folderGroups.get(folderPath)!.push(doc);
		}

		for (const [folderPath, folderDocs] of folderGroups) {
			const folderName = folderPath || "Root";
			this.statusEl.textContent = `Processing folder: ${folderName}...`;

			const individualSummaries: { doc: any; summary: string }[] = [];

			for (let i = 0; i < folderDocs.length; i++) {
				const doc = folderDocs[i];
				this.statusEl.textContent = `Summarizing: ${doc.name} (${i + 1}/${folderDocs.length})`;

				try {
					let content = await this.plugin.indexer.getDocumentContent(doc.path);
					if (content.length > MAX_CONTENT_LENGTH) {
						content = content.substring(0, MAX_CONTENT_LENGTH) + "\n\n[Document truncated due to length]";
					}
					const summaryPrompt = `Please summarize the following document concisely. Return ONLY the summary text, no introduction or conclusion:

${content}`;

					const summary = await this.plugin.complete(summaryPrompt);
					individualSummaries.push({ doc, summary });
				} catch (error) {
					console.error(`Error summarizing ${doc.name}:`, error);
					individualSummaries.push({ doc, summary: "[Error summarizing this document]" });
				}
			}

			this.statusEl.textContent = `Creating final summary for ${folderName}...`;

			const summariesText = individualSummaries
				.map((s, i) => `${i + 1}. [[${s.doc.name}]]\n${s.summary}`)
				.join("\n\n");

			const finalPrompt = `Here are summaries of ${individualSummaries.length} documents:

${summariesText}

Please create a comprehensive summary that:
1. Provides an overview paragraph tying all documents together
2. Lists each document with its key points
3. Suggests meaningful connections between documents using [[Document Name]] format`;

			const finalSummary = await this.plugin.complete(finalPrompt);

			const date = new Date().toISOString().split("T")[0];
			const folderSafeName = folderPath.split("/").pop() || "Root";
			const summaryContent = `# Summary: ${folderSafeName}

${finalSummary}

---
*Generated on ${date} from ${individualSummaries.length} documents in ${folderName}*`;

			await this.createFolderSummary(folderPath, summaryContent);
		}

		new Notice("Summarization complete!");
		this.close();
	}

	private async createFolderSummary(folderPath: string, content: string): Promise<void> {
		let summaryFolder: string;
		if (folderPath) {
			summaryFolder = folderPath;
		} else {
			summaryFolder = "Summaries";
		}

		try {
			const folderExists = this.app.vault.getAbstractFileByPath(summaryFolder);
			if (!folderExists) {
				await this.app.vault.createFolder(summaryFolder);
			}
		} catch (e) {
			console.warn("Could not create folder:", e);
		}

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
		const fullPath = summaryFolder + `/Summary-${timestamp}.md`;

		try {
			const existing = this.app.vault.getAbstractFileByPath(fullPath);
			if (existing) {
				await this.app.vault.modify(existing as TFile, content);
			} else {
				await this.app.vault.create(fullPath, content);
			}
		} catch (error) {
			new Notice(`Error creating summary: ${error}`);
		}
	}

	private parseProposedChanges(result: string): ProposedChange[] {
		const changes: ProposedChange[] = [];
		const id = 0;

		const wikilinkMatches = result.match(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g) || [];

		if (wikilinkMatches.length >= 2) {
			for (let i = 0; i < wikilinkMatches.length - 1; i++) {
				const fromPath = this.findDocumentPath(wikilinkMatches[i]);
				const toPath = this.findDocumentPath(wikilinkMatches[i + 1]);

				if (fromPath || toPath) {
					changes.push({
						id: `change-${id}`,
						type: "wikilink",
						fromPath: fromPath,
						toPath: toPath || fromPath,
						reason: `Link suggestion ${i + 1}`,
						checked: true,
					});
				}
			}
		}

		const hasCreateDoc = result.toLowerCase().includes("create") && result.toLowerCase().includes("document");
		if (hasCreateDoc || (changes.length === 0 && result.length > 50)) {
			changes.push({
				id: `change-${id}`,
				type: "newdoc",
				reason: hasCreateDoc ? "Create summary document" : "Analysis summary",
				checked: true,
				content: result,
			});
		}

		return changes;
	}

	private findDocumentPath(wikilink: string): string | undefined {
		const match = wikilink.match(/\[\[([^\]|]+)/);
		if (!match) return undefined;
		const name = match[1];
		const index = this.plugin.indexer.getIndex();
		if (!index) return undefined;

		for (const doc of Object.values(index.documents)) {
			if (doc.name === name || doc.basename === name) {
				return doc.path;
			}
		}
		return undefined;
	}

	private displayResults() {
		this.resultsContainer.empty();
		this.resultsContainer.style.display = "block";

		const header = this.resultsContainer.createDiv();
		header.style.cssText = "font-weight: 600; margin-bottom: 12px;";
		header.textContent = `Proposed Changes (${this.proposedChanges.length})`;

		const list = this.resultsContainer.createDiv();
		list.style.cssText = "max-height: 300px; overflow-y: auto; margin-bottom: 16px;";

		for (const change of this.proposedChanges) {
			const item = list.createDiv();
			item.style.cssText =
				"padding: 12px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 8px;";

			const checkbox = item.createEl("input", { attr: { type: "checkbox" } }) as HTMLInputElement;
			checkbox.checked = change.checked;
			checkbox.style.marginRight = "8px";
			checkbox.onchange = () => {
				change.checked = checkbox.checked;
			};

			if (change.type === "wikilink") {
				item.createEl("span", {
					text: `Link: ${change.fromPath} → ${change.toPath}`,
				});
			} else {
				item.createEl("span", { text: `Create: ${change.reason}` });
			}
		}

		const buttonRow = this.resultsContainer.createDiv();
		buttonRow.style.cssText = "display: flex; gap: 8px;";

		this.applyBtn = buttonRow.createEl("button", { text: "Apply Selected" }) as HTMLButtonElement;
		this.applyBtn.style.cssText =
			"flex: 1; padding: 12px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 6px; cursor: pointer; font-weight: 600;";
		this.applyBtn.onclick = () => this.applyChanges();

		const modifyBtn = buttonRow.createEl("button", { text: "Modify" }) as HTMLButtonElement;
		modifyBtn.style.cssText =
			"flex: 1; padding: 12px; background: var(--background-modifier-border); border: none; border-radius: 6px; cursor: pointer;";
		modifyBtn.onclick = () => this.onModify();
	}

	private async applyChanges() {
		const selectedChanges = this.proposedChanges.filter((c) => c.checked);
		if (selectedChanges.length === 0) {
			new Notice("No changes selected");
			return;
		}

		this.applyBtn.textContent = "Applying...";
		this.applyBtn.setAttribute("disabled", "true");

		try {
			let appliedCount = 0;
			for (const change of selectedChanges) {
				if (change.type === "wikilink" && change.fromPath && change.toPath) {
					const file = this.app.vault.getAbstractFileByPath(change.fromPath);
					if (file instanceof TFile) {
						await this.plugin.insertWikilink(file, change.toPath);
						appliedCount++;
					} else {
						console.warn(`File not found: ${change.fromPath}`);
					}
				} else if (change.type === "newdoc" && change.content) {
					const date = new Date().toISOString().split("T")[0];
					const filename = `Vault Summary ${date}.md`;
					await this.createSummaryNote(change.content, filename);
					appliedCount++;
				}
			}

			new Notice(`Applied ${appliedCount} changes`);
			this.resultsContainer.style.display = "none";
			this.close();
		} catch (error) {
			new Notice(`Error applying changes: ${error}`);
			console.error("Apply error:", error);
		} finally {
			this.applyBtn.textContent = "Apply Selected";
			this.applyBtn.removeAttribute("disabled");
		}
	}

	private async createSummaryNote(content: string, filename: string): Promise<TFile | null> {
		let folder = "";
		if (this.scopeSelect.value === "selected" && this.plugin.settings.indexFolders.length > 0) {
			folder = this.plugin.settings.indexFolders[0];
		}

		let fullPath: string;
		if (folder) {
			fullPath = folder.endsWith("/") ? folder + filename : folder + "/" + filename;
		} else {
			fullPath = filename;
		}

		try {
			const existing = this.app.vault.getAbstractFileByPath(fullPath);
			if (existing) {
				await this.app.vault.modify(existing as TFile, content);
				return existing as TFile;
			}
			return await this.app.vault.create(fullPath, content);
		} catch (error) {
			new Notice(`Error creating summary: ${error}`);
			return null;
		}
	}

	private async onModify() {
		const prompt = this.promptTextarea.value.trim();
		const modification = prompt + "\n\nPlease revise based on the proposed changes.";

		this.analyzeBtn.textContent = "Revising...";
		this.analyzeBtn.setAttribute("disabled", "true");

		try {
			const result = await this.plugin.complete(modification);
			this.proposedChanges = this.parseProposedChanges(result);
			this.displayResults();
		} catch (error) {
			new Notice(`Error: ${error}`);
		} finally {
			this.analyzeBtn.textContent = "Index Vault & Analyze";
			this.analyzeBtn.removeAttribute("disabled");
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}