import { App, PluginSettingTab, Setting, Notice, Modal } from "obsidian";
import LMStudioCopilotPlugin from "../main";

export class SettingsTab extends PluginSettingTab {
	plugin: LMStudioCopilotPlugin;

	constructor(app: App, plugin: ObsidianLMStudioPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "LM Studio Documents" });
		containerEl.createEl("p", {
			text: "Use local AI to write, edit, and combine markdown documents.",
			cls: "desc",
		});

		this.displayLmStudioSettings(containerEl);
		this.displayDocumentOutputSettings(containerEl);
		this.displayVaultIndexingSettings(containerEl);
		this.displaySummaryCacheSettings(containerEl);
		this.displayVaultTemplates(containerEl);
		this.displaySystemSettings(containerEl);
		this.displayPromptTemplates(containerEl);
	}

	private displayLmStudioSettings(container: HTMLElement): void {
		container.createEl("h3", { text: "LM Studio Connection" });

		new Setting(container)
			.setName("Server URL")
			.setDesc("URL for your LM Studio server (include /v1)")
			.addText((text) => {
				text.setPlaceholder("http://localhost:1234/v1");
				text.setValue(this.plugin.settings.lmStudioUrl);
				text.inputEl.style.width = "100%";
				text.onChange(async (value) => {
					this.plugin.settings.lmStudioUrl = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(container)
			.setName("Model Name")
			.setDesc("Model to use for completions")
			.addText((text) => {
				text.setPlaceholder("local-model");
				text.setValue(this.plugin.settings.lmStudioModel);
				text.inputEl.style.width = "100%";
				text.onChange(async (value) => {
					this.plugin.settings.lmStudioModel = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(container).setName("Test Connection").addButton((btn) => {
			btn.setButtonText("Test");
			btn.onClick(async () => {
				btn.setButtonText("Testing...");
				btn.setDisabled(true);
				const success = await this.plugin.testConnection();
				btn.setButtonText("Test");
				btn.setDisabled(false);
				new Notice(success ? "Connection successful!" : "Connection failed");
			});
		});
	}

	private displayDocumentOutputSettings(container: HTMLElement): void {
		container.createEl("h3", { text: "Document Output" });

		new Setting(container)
			.setName("Output Location")
			.setDesc("Where to save AI-generated documents")
			.addDropdown((dropdown) => {
				dropdown.addOption("current", "Current folder");
				dropdown.addOption("specific", "Specific folder");
				dropdown.setValue(this.plugin.settings.outputLocation);
				dropdown.onChange(async (value) => {
					this.plugin.settings.outputLocation = value as "current" | "specific";
					await this.plugin.saveSettings();
				});
			});

		if (this.plugin.settings.outputLocation === "specific") {
			new Setting(container)
				.setName("Output Folder")
				.setDesc("Folder name for AI-generated documents")
				.addText((text) => {
					text.setPlaceholder("AI Generated");
					text.setValue(this.plugin.settings.outputFolder);
					text.inputEl.style.width = "100%";
					text.onChange(async (value) => {
						this.plugin.settings.outputFolder = value;
						await this.plugin.saveSettings();
					});
				});
		}

		new Setting(container)
			.setName("New Notes Prefix")
			.setDesc("Prefix for new AI-generated notes (e.g., 'AI Note - ')")
			.addText((text) => {
				text.setPlaceholder("");
				text.setValue(this.plugin.settings.newNotePrefix);
				text.inputEl.style.width = "100%";
				text.onChange(async (value) => {
					this.plugin.settings.newNotePrefix = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(container)
			.setName("Default Filename")
			.setDesc("Default filename for new documents (e.g., 'untitled.md')")
			.addText((text) => {
				text.setPlaceholder("untitled.md");
				text.setValue(this.plugin.settings.defaultFilename);
				text.inputEl.style.width = "100%";
				text.onChange(async (value) => {
					this.plugin.settings.defaultFilename = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(container)
			.setName("Max Search Results")
			.setDesc("Maximum files to show in type-ahead search")
			.addSlider((slider) => {
				slider.setLimits(3, 20, 1);
				slider.setValue(this.plugin.settings.maxSearchResults);
				slider.sliderEl.style.width = "100%";
				slider.onChange(async (value) => {
					this.plugin.settings.maxSearchResults = value;
					await this.plugin.saveSettings();
				});
			});
	}

	private displayVaultIndexingSettings(container: HTMLElement): void {
		container.createEl("h3", { text: "Vault Indexing" });

		const index = this.plugin.indexer.getIndex();
		const statusDiv = container.createDiv();
		statusDiv.style.cssText = "margin-bottom: 12px; padding: 8px; background: var(--background-secondary); border-radius: 4px; font-size: 0.9em;";
		if (index) {
			const date = new Date(index.lastIndexed);
			statusDiv.textContent = `Indexed: ${index.documentCount} documents | Last: ${date.toLocaleString()}`;
		} else {
			statusDiv.textContent = "Not indexed yet";
		}

		new Setting(container)
			.setName("Auto-index on startup")
			.setDesc("Automatically index vault when Obsidian starts")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.autoIndexOnStartup);
				toggle.onChange(async (value) => {
					this.plugin.settings.autoIndexOnStartup = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(container)
			.setName("Periodic re-index")
			.setDesc("How often to automatically re-index the vault")
			.addDropdown((dropdown) => {
				dropdown.addOption("off", "Off");
				dropdown.addOption("daily", "Daily");
				dropdown.addOption("weekly", "Weekly");
				dropdown.setValue(this.plugin.settings.periodicReindex);
				dropdown.onChange(async (value) => {
					this.plugin.settings.periodicReindex = value as "off" | "daily" | "weekly";
					await this.plugin.saveSettings();
				});
			});

		new Setting(container)
			.setName("Index folders")
			.setDesc("Folders to index (comma-separated, empty = all)")
			.addText((text) => {
				text.setPlaceholder("folder1, folder2");
				text.setValue(this.plugin.settings.indexFolders.join(", "));
				text.inputEl.style.width = "100%";
				text.onChange(async (value) => {
					this.plugin.settings.indexFolders = value
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean);
					await this.plugin.saveSettings();
				});
			});

		new Setting(container).setName("Re-index Now").addButton((btn) => {
			btn.setButtonText("Re-index");
			btn.onClick(async () => {
				btn.setButtonText("Indexing...");
				btn.setDisabled(true);
				try {
					await this.plugin.indexVault();
					new Notice("Indexing complete!");
					this.display();
				} catch (error) {
					new Notice(`Indexing failed: ${error}`);
				} finally {
					btn.setButtonText("Re-index");
					btn.setDisabled(false);
				}
			});
		});
	}

	private displaySummaryCacheSettings(container: HTMLElement): void {
		container.createEl("h3", { text: "Summary Cache" });

		const cache = this.plugin.getSummaryCache();
		const individualCount = Object.keys(cache.individualSummaries).length;
		const folderCount = Object.keys(cache.folderSummaries).length;

		const statusDiv = container.createDiv();
		statusDiv.style.cssText = "margin-bottom: 12px; padding: 8px; background: var(--background-secondary); border-radius: 4px; font-size: 0.9em;";
		statusDiv.textContent = `Cached: ${individualCount} individual summaries, ${folderCount} folder summaries`;

		new Setting(container)
			.setName("Summary Cache Max Size")
			.setDesc("Maximum number of individual document summaries to cache")
			.addText((text) => {
				text.setValue(String(this.plugin.settings.summaryCacheMaxSize));
				text.inputEl.style.width = "100px";
				text.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.summaryCacheMaxSize = num;
						await this.plugin.saveSettings();
					}
				});
			});

		new Setting(container)
			.setName("Summary Cache Expiration (days)")
			.setDesc("Summaries older than this will be regenerated (0 = never expire)")
			.addText((text) => {
				text.setValue(String(this.plugin.settings.summaryCacheExpirationDays));
				text.inputEl.style.width = "100px";
				text.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num >= 0) {
						this.plugin.settings.summaryCacheExpirationDays = num;
						await this.plugin.saveSettings();
					}
				});
			});

		new Setting(container).setName("Clear Summary Cache").addButton((btn) => {
			btn.setButtonText("Clear Cache");
			btn.onClick(async () => {
				this.plugin.clearSummaryCache();
				new Notice("Summary cache cleared");
				this.display();
			});
		});
	}

	private displayVaultTemplates(container: HTMLElement): void {
		container.createEl("h3", { text: "Vault Templates" });

		const templatesContainer = container.createDiv("vault-templates-list");
		templatesContainer.style.cssText = "margin-bottom: 16px;";

		const renderTemplates = () => {
			templatesContainer.empty();
			if (this.plugin.settings.vaultTemplates.length === 0) {
				templatesContainer.createEl("p", {
					text: "No vault templates yet. Add one below.",
					cls: "desc",
				});
			} else {
				for (const template of this.plugin.settings.vaultTemplates) {
					const item = templatesContainer.createDiv();
					item.style.cssText =
						"border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 6px; margin-bottom: 8px;";

					const header = item.createDiv();
					header.style.cssText = "display: flex; justify-content: space-between; align-items: center;";

					header.createEl("span", { text: template.name }).style.cssText = "font-weight: 600;";

					const actions = header.createDiv();
					actions.style.cssText = "display: flex; gap: 8px;";

					const editBtn = actions.createEl("button", { text: "Edit" });
					editBtn.style.cssText =
						"padding: 4px 12px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 4px; cursor: pointer;";
					editBtn.onclick = () => this.showEditVaultTemplateModal(template.id);

					const deleteBtn = actions.createEl("button", { text: "Delete" });
					deleteBtn.style.cssText =
						"padding: 4px 12px; background: var(--background-modifier-error); color: var(--text-on-error); border: none; border-radius: 4px; cursor: pointer;";
					deleteBtn.onclick = async () => {
						this.plugin.deleteVaultTemplate(template.id);
						renderTemplates();
					};
				}
			}
		};

		renderTemplates();

		new Setting(container).addButton((btn) => {
			btn.setButtonText("Add Vault Template");
			btn.setIcon("plus");
			btn.onClick(() => this.showAddVaultTemplateModal(renderTemplates));
		});
	}

	private showAddVaultTemplateModal(onComplete: () => void): void {
		const modal = new VaultTemplateModal(this.app, null, (template) => {
			this.plugin.addVaultTemplate(template);
			onComplete();
		});
		modal.open();
	}

	private showEditVaultTemplateModal(templateId: string): void {
		const template = this.plugin.settings.vaultTemplates.find((t) => t.id === templateId);
		if (!template) return;

		const modal = new VaultTemplateModal(this.app, template, (updated) => {
			this.plugin.updateVaultTemplate(templateId, updated);
			this.display();
		});
		modal.open();
	}

	private displaySystemSettings(container: HTMLElement): void {
		container.createEl("h3", { text: "System" });

		new Setting(container)
			.setName("System Prompt")
			.setDesc("Instructions for the AI about handling documents")
			.addTextArea((text) => {
				text.setPlaceholder("Enter system prompt...");
				text.setValue(this.plugin.settings.systemPrompt);
				text.inputEl.style.width = "100%";
				text.inputEl.style.height = "150px";
				text.inputEl.style.fontSize = "12px";
				text.onChange(async (value) => {
					this.plugin.settings.systemPrompt = value;
					await this.plugin.saveSettings();
				});
			});
	}

	private displayPromptTemplates(container: HTMLElement): void {
		container.createEl("h3", { text: "Prompt Templates" });

		const templatesContainer = container.createDiv("templates-list");
		templatesContainer.style.cssText = "margin-bottom: 16px;";

		const renderTemplates = () => {
			templatesContainer.empty();
			if (this.plugin.settings.promptTemplates.length === 0) {
				templatesContainer.createEl("p", {
					text: "No templates yet. Add one below.",
					cls: "desc",
				});
			} else {
				for (const template of this.plugin.settings.promptTemplates) {
					const item = templatesContainer.createDiv();
					item.style.cssText =
						"border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 6px; margin-bottom: 8px;";

					const header = item.createDiv();
					header.style.cssText = "display: flex; justify-content: space-between; align-items: center;";

					header.createEl("span", { text: template.name }).style.cssText = "font-weight: 600;";

					const actions = header.createDiv();
					actions.style.cssText = "display: flex; gap: 8px;";

					const editBtn = actions.createEl("button", { text: "Edit" });
					editBtn.style.cssText =
						"padding: 4px 12px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 4px; cursor: pointer;";
					editBtn.onclick = () => this.showEditTemplateModal(template.id);

					const deleteBtn = actions.createEl("button", { text: "Delete" });
					deleteBtn.style.cssText =
						"padding: 4px 12px; background: var(--background-modifier-error); color: var(--text-on-error); border: none; border-radius: 4px; cursor: pointer;";
					deleteBtn.onclick = async () => {
						this.plugin.deletePromptTemplate(template.id);
						renderTemplates();
					};
				}
			}
		};

		renderTemplates();

		new Setting(container).addButton((btn) => {
			btn.setButtonText("Add Template");
			btn.setIcon("plus");
			btn.onClick(() => this.showAddTemplateModal(renderTemplates));
		});
	}

	private showAddTemplateModal(onComplete: () => void): void {
		const modal = new TemplateModal(this.app, null, (template) => {
			this.plugin.addPromptTemplate(template);
			onComplete();
		});
		modal.open();
	}

	private showEditTemplateModal(templateId: string): void {
		const template = this.plugin.settings.promptTemplates.find((t) => t.id === templateId);
		if (!template) return;

		const modal = new TemplateModal(this.app, template, (updated) => {
			this.plugin.updatePromptTemplate(templateId, updated);
			this.display();
		});
		modal.open();
	}
}

class TemplateModal extends Modal {
	template: { id: string; name: string; content: string } | null;
	onSave: (template: { id: string; name: string; content: string }) => void;

	constructor(
		app: App,
		template: { id: string; name: string; content: string } | null,
		onSave: (template: { id: string; name: string; content: string }) => void
	) {
		super(app);
		this.template = template;
		this.onSave = onSave;
	}

	onOpen() {
		const { titleEl, contentEl } = this;
		titleEl.textContent = this.template ? "Edit Template" : "Add Template";

		contentEl.style.cssText = "padding: 20px;";

		contentEl.createEl("label", { text: "Template Name" }).style.cssText =
			"display: block; margin-bottom: 8px; font-weight: 600;";
		const nameInput = contentEl.createEl("input", {
			attr: { type: "text", placeholder: "e.g., Meeting Notes" },
		});
		nameInput.style.cssText = "width: 100%; margin-bottom: 16px; padding: 8px;";
		nameInput.value = this.template?.name || "";

		contentEl
			.createEl("label", { text: "Template Content" })
			.style.cssText = "display: block; margin-bottom: 8px; font-weight: 600;";
		contentEl
			.createEl("p", {
				text: "Use {{variable}} for dynamic values. Example: {{title}}, {{date}}",
			})
			.style.cssText = "font-size: 0.85em; color: var(--text-muted); margin-bottom: 8px;";

		const contentInput = contentEl.createEl("textarea", {
			attr: { placeholder: "Enter template content..." },
		});
		contentInput.style.cssText = "width: 100%; height: 200px; margin-bottom: 16px; padding: 8px; font-family: monospace;";
		contentInput.value = this.template?.content || "";

		const buttons = contentEl.createDiv();
		buttons.style.cssText = "display: flex; gap: 8px; justify-content: flex-end;";

		const saveBtn = buttons.createEl("button", { text: "Save" });
		saveBtn.style.cssText =
			"padding: 8px 24px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 6px; cursor: pointer; font-weight: 600;";
		saveBtn.onclick = () => {
			const name = nameInput.value.trim();
			const content = contentInput.value;
			if (!name) {
				new Notice("Template name is required");
				return;
			}
			this.onSave({
				id: this.template?.id || crypto.randomUUID(),
				name,
				content,
			});
			this.close();
		};

		const cancelBtn = buttons.createEl("button", { text: "Cancel" });
		cancelBtn.style.cssText =
			"padding: 8px 24px; background: var(--background-modifier-border); border: none; border-radius: 6px; cursor: pointer;";
		cancelBtn.onclick = () => this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class VaultTemplateModal extends Modal {
	template: { id: string; name: string; content: string } | null;
	onSave: (template: { id: string; name: string; content: string }) => void;

	constructor(
		app: App,
		template: { id: string; name: string; content: string } | null,
		onSave: (template: { id: string; name: string; content: string }) => void
	) {
		super(app);
		this.template = template;
		this.onSave = onSave;
	}

	onOpen() {
		const { titleEl, contentEl } = this;
		titleEl.textContent = this.template ? "Edit Vault Template" : "Add Vault Template";

		contentEl.style.cssText = "padding: 20px;";

		contentEl.createEl("label", { text: "Template Name" }).style.cssText =
			"display: block; margin-bottom: 8px; font-weight: 600;";
		const nameInput = contentEl.createEl("input", {
			attr: { type: "text", placeholder: "e.g., Find Connections" },
		});
		nameInput.style.cssText = "width: 100%; margin-bottom: 16px; padding: 8px;";
		nameInput.value = this.template?.name || "";

		contentEl
			.createEl("label", { text: "Template Content" })
			.style.cssText = "display: block; margin-bottom: 8px; font-weight: 600;";
		contentEl
			.createEl("p", {
				text: "Use {{variable}} for dynamic values. Example: {{topic}}, {{question}}",
			})
			.style.cssText = "font-size: 0.85em; color: var(--text-muted); margin-bottom: 8px;";

		const contentInput = contentEl.createEl("textarea", {
			attr: { placeholder: "Enter template content..." },
		});
		contentInput.style.cssText = "width: 100%; height: 200px; margin-bottom: 16px; padding: 8px; font-family: monospace;";
		contentInput.value = this.template?.content || "";

		const buttons = contentEl.createDiv();
		buttons.style.cssText = "display: flex; gap: 8px; justify-content: flex-end;";

		const saveBtn = buttons.createEl("button", { text: "Save" });
		saveBtn.style.cssText =
			"padding: 8px 24px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 6px; cursor: pointer; font-weight: 600;";
		saveBtn.onclick = () => {
			const name = nameInput.value.trim();
			const content = contentInput.value;
			if (!name) {
				new Notice("Template name is required");
				return;
			}
			this.onSave({
				id: this.template?.id || crypto.randomUUID(),
				name,
				content,
			});
			this.close();
		};

		const cancelBtn = buttons.createEl("button", { text: "Cancel" });
		cancelBtn.style.cssText =
			"padding: 8px 24px; background: var(--background-modifier-border); border: none; border-radius: 6px; cursor: pointer;";
		cancelBtn.onclick = () => this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}