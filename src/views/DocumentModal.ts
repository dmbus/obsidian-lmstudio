import { App, Modal, Notice, TFile } from "obsidian";
import LMStudioCopilotPlugin from "../main";

type PromptMode = "freeform" | "template";
type EditMode = "append" | "replace" | "edit";

export class DocumentModal extends Modal {
	plugin: LMStudioCopilotPlugin;

	private selectedFile: TFile | null = null;
	private modeDropdown!: HTMLSelectElement;
	private promptModeToggle!: HTMLDivElement;
	private instructionsTextarea!: HTMLTextAreaElement;
	private templateSelect!: HTMLSelectElement;
	private templateTextarea!: HTMLTextAreaElement;
	private variablesContainer!: HTMLDivElement;
	private generateBtn!: HTMLButtonElement;

	constructor(app: App, plugin: ObsidianLMStudioPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { titleEl, contentEl } = this;
		titleEl.textContent = "Document Assistant";
		contentEl.style.cssText = "padding: 20px;";

		this.selectedFile = this.app.workspace.getActiveFile();

		this.renderForm(contentEl);
	}

	private renderForm(container: HTMLElement) {
		const titleSection = container.createDiv();
		titleSection.style.cssText = "margin-bottom: 16px; position: relative;";

		titleSection
			.createEl("label", { text: "Document" })
			.style.cssText = "display: block; margin-bottom: 8px; font-weight: 600;";

		const inputContainer = titleSection.createDiv();
		inputContainer.style.cssText = "position: relative;";

		const titleInput = inputContainer.createEl("input", {
			attr: { type: "text", placeholder: "Type to search documents..." },
		});
		titleInput.style.cssText =
			"width: 100%; padding: 12px; border-radius: 6px; font-size: 14px;";
		titleInput.addEventListener("input", () => this.onTitleInput(titleInput));

		if (this.selectedFile) {
			titleInput.value = this.selectedFile.path;
		}

		const searchDropdown = inputContainer.createDiv();
		searchDropdown.style.cssText =
			"position: absolute; top: 100%; left: 0; right: 0; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 6px; max-height: 200px; overflow-y: auto; z-index: 1000; display: none;";
		titleInput.addEventListener("blur", () => {
			setTimeout(() => (searchDropdown.style.display = "none"), 200);
		});

		const modeSection = container.createDiv();
		modeSection.style.cssText = "margin-bottom: 16px;";
		modeSection
			.createEl("label", { text: "Mode" })
			.style.cssText = "display: block; margin-bottom: 8px; font-weight: 600;";

		this.modeDropdown = modeSection.createEl("select") as HTMLSelectElement;
		this.modeDropdown.style.cssText =
			"width: 100%; padding: 12px; border-radius: 6px; font-size: 14px; background: var(--background-primary) !important; color: var(--text-normal) !important; border: 1px solid var(--background-modifier-border) !important;";
		this.modeDropdown.add(new Option("Edit/Rewrite", "edit"));
		this.modeDropdown.add(new Option("Append to existing", "append"));
		this.modeDropdown.add(new Option("Replace existing", "replace"));
		this.modeDropdown.value = "edit";

		this.renderPromptSection(container);

		const buttonSection = container.createDiv();
		buttonSection.style.cssText = "margin-top: 20px;";

		this.generateBtn = buttonSection.createEl("button", { text: "Generate" }) as HTMLButtonElement;
		this.generateBtn.style.cssText =
			"width: 100%; padding: 12px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px;";
		this.generateBtn.onclick = () => this.generateAndSave();

		const statusDiv = container.createDiv();
		statusDiv.style.cssText =
			"margin-top: 12px; padding: 8px; background: var(--background-secondary); border-radius: 4px; font-size: 0.9em; color: var(--text-muted);";
		statusDiv.textContent = "Select a document to edit, or leave empty to create new";

		const updateStatus = () => {
			if (this.selectedFile) {
				statusDiv.textContent = `Selected: ${this.selectedFile.name}`;
				statusDiv.style.color = "var(--text-normal)";
			} else {
				statusDiv.textContent = `Will create new: ${this.plugin.settings.newNotePrefix}${this.plugin.settings.defaultFilename}`;
				statusDiv.style.color = "var(--text-muted)";
			}
		};
		updateStatus();

		(container as any).updateStatus = updateStatus;
	}

	private onTitleInput(input: HTMLInputElement) {
		const query = input.value.trim();
		const container = input.parentElement;
		const dropdown = container?.querySelector("div") as HTMLDivElement;

		if (query.length < 2) {
			dropdown.style.display = "none";
			this.selectedFile = null;
			(this.contentEl.querySelector("[data-status]") as HTMLElement)?.setAttribute("data-status", "new");
			return;
		}

		const files = this.plugin.searchFiles(query);
		if (files.length === 0) {
			dropdown.style.display = "none";
			this.selectedFile = null;
			return;
		}

		dropdown.style.display = "block";
		dropdown.style.width = input.offsetWidth + "px";
		dropdown.empty();

		for (const file of files) {
			const item = dropdown.createDiv();
			item.style.cssText =
				"padding: 10px; cursor: pointer; border-bottom: 1px solid var(--background-modifier-border);";
			item.createEl("div", { text: file.path }).style.cssText = "font-weight: 600; font-size: 0.9em;";
			item.onmouseenter = () => {
				item.style.background = "var(--background-modifier-border)";
			};
			item.onmouseleave = () => {
				item.style.background = "";
			};
			item.onclick = () => {
				input.value = file.path;
				this.selectedFile = file;
				dropdown.style.display = "none";
				const statusDiv = this.contentEl.querySelector("div[style*='margin-top: 12px']") as HTMLElement;
				if (statusDiv) {
					statusDiv.textContent = `Selected: ${file.name}`;
					statusDiv.style.color = "var(--text-normal)";
				}
			};
		}
	}

	private renderPromptSection(container: HTMLElement) {
		const promptSection = container.createDiv();
		promptSection.style.cssText = "margin-bottom: 16px;";

		promptSection
			.createEl("label", { text: "Prompt" })
			.style.cssText = "display: block; margin-bottom: 8px; font-weight: 600;";

		const promptToggle = promptSection.createDiv();
		promptToggle.style.cssText = "display: flex; gap: 12px; margin-bottom: 12px;";

		const freeformLabel = promptToggle.createEl("label");
		freeformLabel.style.cssText = "display: flex; align-items: center; gap: 6px; cursor: pointer;";
		const freeformRadio = freeformLabel.createEl("input", {
			attr: { type: "radio", name: "promptMode" },
		});
		freeformRadio.setAttribute("checked", "true");
		freeformLabel.appendChild(document.createTextNode(" Freeform"));
		freeformRadio.addEventListener("change", () => this.onPromptModeChange("freeform"));

		const templateLabel = promptToggle.createEl("label");
		templateLabel.style.cssText = "display: flex; align-items: center; gap: 6px; cursor: pointer;";
		const templateRadio = templateLabel.createEl("input", {
			attr: { type: "radio", name: "promptMode" },
		});
		templateLabel.appendChild(document.createTextNode(" Template"));
		templateRadio.addEventListener("change", () => this.onPromptModeChange("template"));

		this.promptModeToggle = promptToggle;

		this.instructionsTextarea = promptSection.createEl("textarea", {
			attr: { placeholder: "e.g., Summarize this document" },
		}) as HTMLTextAreaElement;
		this.instructionsTextarea.style.cssText =
			"width: 100%; height: 150px; padding: 12px; border-radius: 6px; margin-bottom: 12px; resize: vertical;";
		this.instructionsTextarea.value = "";

		const templateSection = promptSection.createDiv();
		templateSection.style.cssText = "margin-bottom: 12px; display: none;";

		templateSection
			.createEl("label", { text: "Template" })
			.style.cssText = "display: block; margin-bottom: 8px;";

		this.templateSelect = templateSection.createEl("select") as HTMLSelectElement;
		this.templateSelect.style.cssText =
			"width: 100%; padding: 12px; border-radius: 6px; margin-bottom: 12px; font-size: 14px; background: var(--background-primary) !important; color: var(--text-normal) !important; border: 1px solid var(--background-modifier-border) !important;";
		this.templateSelect.add(new Option("Select a template...", ""));
		for (const t of this.plugin.settings.promptTemplates) {
			this.templateSelect.add(new Option(t.name, t.id));
		}
		this.templateSelect.addEventListener("change", () => this.onTemplateSelect());

		this.templateTextarea = templateSection.createEl("textarea") as HTMLTextAreaElement;
		this.templateTextarea.style.cssText =
			"width: 100%; height: 180px; padding: 12px; border-radius: 6px; margin-bottom: 12px; font-family: monospace; resize: vertical;";
		this.templateTextarea.disabled = true;

		this.variablesContainer = templateSection.createDiv();

		this.promptModeToggle.dataset.mode = "freeform";
	}

	private onPromptModeChange(mode: PromptMode) {
		this.promptModeToggle.dataset.mode = mode;
		const templateSection = this.templateSelect.parentElement;

		if (mode === "freeform") {
			this.instructionsTextarea.style.display = "block";
			templateSection!.style.display = "none";
		} else {
			this.instructionsTextarea.style.display = "none";
			templateSection!.style.display = "block";
		}
	}

	private onTemplateSelect() {
		const template = this.plugin.settings.promptTemplates.find(
			(t) => t.id === this.templateSelect.value
		);
		if (template) {
			this.templateTextarea.value = template.content;
			this.templateTextarea.disabled = false;
			this.renderTemplateVariables(template.content);
		} else {
			this.templateTextarea.value = "";
			this.templateTextarea.disabled = true;
			this.variablesContainer.empty();
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
			} else if (varName === "time") {
				input.value = new Date().toTimeString().slice(0, 5);
			} else if (varName === "title") {
				input.value = this.selectedFile ? this.selectedFile.basename : "Untitled";
			}
		}
	}

	private async generateAndSave(): Promise<void> {
		const mode = this.modeDropdown.value as EditMode;
		const promptMode = this.promptModeToggle.dataset.mode as PromptMode;

		let instructions = "";

		if (promptMode === "template") {
			const templateContent = this.templateTextarea.value;
			if (!templateContent) {
				new Notice("Please select a template");
				return;
			}
			const variables: Record<string, string> = {};
			const varInputs = this.variablesContainer.querySelectorAll("input");
			const varLabels = this.variablesContainer.querySelectorAll("label");

			for (let i = 0; i < varLabels.length; i++) {
				const varName = varLabels[i].textContent || "";
				const varValue = (varInputs[i] as HTMLInputElement)?.value || "";
				variables[varName] = varValue;
			}

			instructions = this.plugin.substituteTemplate(templateContent, variables);
		} else {
			instructions = this.instructionsTextarea.value.trim();
			if (!instructions) {
				new Notice("Please enter instructions");
				return;
			}
		}

		try {
			this.generateBtn.textContent = "Generating...";
			this.generateBtn.setAttribute("disabled", "true");

			const existingContent = this.selectedFile
				? await this.app.vault.read(this.selectedFile)
				: "";

			let prompt = "";
			if (mode === "append") {
				prompt = `User request:\n${instructions}\n\n${existingContent ? "Existing content:\n" + existingContent : ""}`;
			} else if (mode === "replace") {
				prompt = `User request:\n${instructions}\n\nExisting content:\n${existingContent}`;
			} else {
				prompt = `User request:\n${instructions}\n\nExisting content:\n${existingContent}`;
			}

			const result = await this.plugin.complete(prompt);

			let file: TFile | null = null;

			if (this.selectedFile) {
				if (mode === "append") {
					file = await this.plugin.appendToNote(result.trim(), this.selectedFile);
				} else {
					await this.app.vault.modify(this.selectedFile, result.trim());
					file = this.selectedFile;
				}
			} else {
				const filename = `${this.plugin.settings.newNotePrefix}${this.plugin.settings.defaultFilename}`;
				file = await this.plugin.createNote(result.trim(), filename);
			}

			if (file) {
				new Notice(`Saved: ${file.path}`);
				this.close();
				const leaf = this.app.workspace.getLeaf(true);
				await leaf.openFile(file);
			}
		} catch (error) {
			new Notice(`Error: ${error}`);
		} finally {
			this.generateBtn.textContent = "Generate";
			this.generateBtn.removeAttribute("disabled");
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}