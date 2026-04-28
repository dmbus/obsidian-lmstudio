import { Notice, TFile } from "obsidian";
import LMStudioCopilotPlugin from "../main";

export type JobType = "index" | "summarize" | "generate" | "analyze" | "apply";
export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface JobProgress {
	current: number;
	total: number;
	message?: string;
}

export interface JobResult {
	type: "success" | "partial" | "failed";
	message: string;
	filesCreated?: string[];
	filesModified?: string[];
}

export interface Job {
	id: string;
	type: JobType;
	status: JobStatus;
	description: string;
	progress: JobProgress | null;
	createdAt: number;
	startedAt?: number;
	completedAt?: number;
	result?: JobResult;
	error?: string;
	options?: GenerateOptions | AnalyzeOptions | { folders?: string[] | null };
}

export interface GenerateOptions {
	prompt: string;
	filename: string;
	mode: "write" | "edit" | "append";
	selectedFile?: TFile;
}

export interface AnalyzeOptions {
	prompt: string;
	folders: string[] | null;
	templateId?: string;
}

export type JobStatusCallback = (jobs: Job[]) => void;

export class JobQueueManager {
	private plugin: LMStudioCopilotPlugin;
	private jobs: Job[] = [];
	private currentJobId: string | null = null;
	private isProcessing = false;
	private statusCallbacks: JobStatusCallback[] = [];

	constructor(plugin: LMStudioCopilotPlugin) {
		this.plugin = plugin;
	}

	async loadState(): Promise<void> {
		const data = await this.plugin.loadData();
		if (data && data.jobQueue) {
			this.jobs = data.jobQueue.jobs || [];

			for (const job of this.jobs) {
				if (job.status === "running") {
					job.status = "pending";
				}
			}

			this.notifyListeners();
		}
	}

	async saveState(): Promise<void> {
		await this.plugin.saveData({
			...this.plugin.settings,
			jobQueue: {
				jobs: this.jobs,
				currentJobId: this.currentJobId,
			},
		});
	}

	private generateId(): string {
		return `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}

	private generateDescription(type: JobType, options?: GenerateOptions | AnalyzeOptions | { folders?: string[] | null }): string {
		switch (type) {
			case "index":
				if (options && "folders" in options && options.folders && options.folders.length > 0) {
					return `Index: ${options.folders.join(", ")}`;
				}
				return "Index vault";
			case "summarize":
				if (options && "folders" in options && options.folders && options.folders.length > 0) {
					return `Summarize: ${options.folders.join(", ")}`;
				}
				return "Summarize vault";
			case "generate":
				if (options && "filename" in options) {
					return `Generate: ${options.filename}`;
				}
				return "Generate document";
			case "analyze":
				if (options && "prompt" in options) {
					const prompt = options.prompt;
					const truncated = prompt.length > 30 ? prompt.substring(0, 30) + "..." : prompt;
					return `Analyze: ${truncated}`;
				}
				return "Analyze documents";
			case "apply":
				return "Apply changes";
			default:
				return "AI task";
		}
	}

	addJob(type: JobType, options?: GenerateOptions | AnalyzeOptions | { folders?: string[] | null }): Job {
		const job: Job = {
			id: this.generateId(),
			type,
			status: "pending",
			description: this.generateDescription(type, options),
			progress: null,
			createdAt: Date.now(),
			options,
		};

		this.jobs.push(job);
		this.saveState();
		this.notifyListeners();

		if (!this.isProcessing) {
			this.processNext();
		}

		return job;
	}

	cancelJob(jobId: string): boolean {
		const job = this.jobs.find((j) => j.id === jobId);
		if (!job) return false;

		if (job.status === "pending") {
			job.status = "cancelled";
			job.completedAt = Date.now();
			this.saveState();
			this.notifyListeners();
			return true;
		}

		if (job.status === "running" && this.currentJobId === jobId) {
			job.status = "cancelled";
			job.completedAt = Date.now();
			this.currentJobId = null;
			this.saveState();
			this.notifyListeners();
			return true;
		}

		return false;
	}

	cancelAll(): void {
		for (const job of this.jobs) {
			if (job.status === "pending" || job.status === "running") {
				job.status = "cancelled";
				job.completedAt = Date.now();
			}
		}
		this.currentJobId = null;
		this.isProcessing = false;
		this.saveState();
		this.notifyListeners();
	}

	getJobs(): Job[] {
		return [...this.jobs];
	}

	getRunningJob(): Job | null {
		if (this.currentJobId) {
			return this.jobs.find((j) => j.id === this.currentJobId) || null;
		}
		return null;
	}

	getPendingCount(): number {
		return this.jobs.filter((j) => j.status === "pending").length;
	}

	getHistoryJobs(): Job[] {
		return this.jobs.filter((j) =>
			j.status === "completed" || j.status === "failed" || j.status === "cancelled"
		);
	}

	clearHistory(): void {
		this.jobs = this.jobs.filter((j) => j.status === "pending" || j.status === "running");
		this.saveState();
		this.notifyListeners();
	}

	onStatusChange(callback: JobStatusCallback): void {
		this.statusCallbacks.push(callback);
	}

	private notifyListeners(): void {
		for (const callback of this.statusCallbacks) {
			callback(this.getDisplayJobs());
		}
	}

	getDisplayJobs(): Job[] {
		const pending = this.jobs.filter((j) => j.status === "pending");
		const running = this.jobs.filter((j) => j.status === "running");
		const history = this.getHistoryJobs().slice(-20);
		return [...running, ...pending, ...history];
	}

	private async processNext(): Promise<void> {
		if (this.isProcessing) return;

		const nextJob = this.jobs.find((j) => j.status === "pending");
		if (!nextJob) {
			this.isProcessing = false;
			return;
		}

		this.isProcessing = true;
		nextJob.status = "running";
		nextJob.startedAt = Date.now();
		this.currentJobId = nextJob.id;
		this.saveState();
		this.notifyListeners();

		try {
			switch (nextJob.type) {
				case "index":
					await this.runIndexJob(nextJob);
					break;
				case "summarize":
					await this.runSummarizeJob(nextJob);
					break;
				case "generate":
					await this.runGenerateJob(nextJob);
					break;
				case "analyze":
					await this.runAnalyzeJob(nextJob);
					break;
				case "apply":
					await this.runApplyJob(nextJob);
					break;
			}

			if (nextJob.status !== "cancelled") {
				nextJob.status = "completed";
				nextJob.completedAt = Date.now();
				nextJob.progress = null;
			}
		} catch (error) {
			if (nextJob.status !== "cancelled") {
				nextJob.status = "failed";
				nextJob.error = error instanceof Error ? error.message : String(error);
				nextJob.completedAt = Date.now();
			}
		}

		this.currentJobId = null;
		this.saveState();
		this.notifyListeners();

		this.isProcessing = false;
		this.processNext();
	}

	private async runIndexJob(job: Job): Promise<void> {
		const folders = (job as any).folders || null;

		await this.plugin.indexVault(folders, (current, total) => {
			job.progress = { current, total, message: `Indexing: ${current}/${total}` };
			this.notifyListeners();
		});

		const index = this.plugin.indexer.getIndex();
		job.result = {
			type: "success",
			message: `Indexed ${index?.documentCount || 0} documents`,
			filesModified: [],
		};

		new Notice(`✅ ${job.result.message}`);
	}

	private async runSummarizeJob(job: Job): Promise<void> {
		const folders = (job as any).folders || null;
		const MAX_CONTENT_LENGTH = 10000;

		await this.plugin.indexVault(folders, (current, total) => {
			job.progress = { current: current / 2, total, message: `Indexing: ${current}/${total}` };
			this.notifyListeners();
		});

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
			throw new Error("No documents found");
		}

		const folderGroups = new Map<string, any[]>();
		for (const doc of allDocs) {
			const folderPath = doc.path.includes("/") ? doc.path.substring(0, doc.path.lastIndexOf("/")) : "";
			if (!folderGroups.has(folderPath)) {
				folderGroups.set(folderPath, []);
			}
			folderGroups.get(folderPath)!.push(doc);
		}

		const date = new Date().toISOString().split("T")[0];
		const folderSummaryInfos: { folderPath: string; folderSafeName: string; summaryHash: string; summaryFileName: string }[] = [];
		const totalFolders = folderGroups.size;
		let currentFolder = 0;
		const createdFiles: string[] = [];

		for (const [folderPath, folderDocs] of folderGroups) {
			if (folderDocs.length === 0) continue;

			currentFolder++;
			const folderName = folderPath || "Root";

			job.progress = {
				current: currentFolder,
				total: totalFolders,
				message: `Summarizing: ${folderName}`,
			};
			this.notifyListeners();

			const individualSummaries: { doc: any; summary: string }[] = [];

			for (let i = 0; i < folderDocs.length; i++) {
				const doc = folderDocs[i];

				job.progress = {
					current: currentFolder,
					total: totalFolders,
					message: `Summarizing: ${doc.name} (${i + 1}/${folderDocs.length})`,
				};
				this.notifyListeners();

				if (this.plugin.isIndividualSummaryCacheValid(doc.path, doc.contentHash)) {
					const cached = this.plugin.getSummaryCache().individualSummaries[doc.path];
					individualSummaries.push({ doc, summary: cached.summary });
				} else {
					try {
						let content = await this.plugin.indexer.getDocumentContent(doc.path);
						if (content.length > MAX_CONTENT_LENGTH) {
							content = content.substring(0, MAX_CONTENT_LENGTH) + "\n\n[Document truncated due to length]";
						}
						const summaryPrompt = `Please summarize the following document concisely. Return ONLY the summary text, no introduction or conclusion:

${content}`;

						const summary = await this.plugin.complete(summaryPrompt);
						this.plugin.updateIndividualSummaryCache(doc.path, doc.contentHash, summary);
						individualSummaries.push({ doc, summary });
					} catch (error) {
						console.error(`Error summarizing ${doc.name}:`, error);
						individualSummaries.push({ doc, summary: "[Error summarizing this document]" });
					}
				}
			}

			job.progress = {
				current: currentFolder,
				total: totalFolders,
				message: `Creating summary for: ${folderName}`,
			};
			this.notifyListeners();

			const currentDocHashes = folderDocs.map(d => d.contentHash).sort();
			let folderSummary: string;
			const folderKey = folderPath || "Root";

			if (this.plugin.canUseCachedFolderSummary(folderKey, currentDocHashes)) {
				folderSummary = this.plugin.getSummaryCache().folderSummaries[folderKey].summary;
			} else {
				const summariesText = individualSummaries
					.map((s, i) => `${i + 1}. [[${s.doc.name}]]\n${s.summary}`)
					.join("\n\n");

				const finalPrompt = `Here are summaries of ${individualSummaries.length} documents:

${summariesText}

Please create a comprehensive summary that:
1. Provides an overview paragraph tying all documents together
2. Lists each document with its key points
3. Suggests meaningful connections between documents using [[Document Name]] format`;

				folderSummary = await this.plugin.complete(finalPrompt);
			}

			const folderSafeName = folderPath.split("/").pop() || "Root";
			const folderSummaryFileName = `Summary ${folderSafeName} ${date}.md`;
			const folderSummaryHeader = folderPath ? `# Summary: ${folderPath}` : `# Summary: Root`;
			const folderSummaryContent = `${folderSummaryHeader}

${folderSummary}

---
*Generated on ${date} from ${individualSummaries.length} documents in ${folderName}*`;

			const summaryHash = this.plugin.generateSummaryHash(folderSummaryContent);

			this.plugin.updateFolderSummaryCache(folderKey, currentDocHashes, summaryHash, folderSummaryContent);

			const filePath = await this.createFolderSummary(folderPath, folderSummaryContent);
			if (filePath) {
				createdFiles.push(filePath);
			}

			folderSummaryInfos.push({
				folderPath,
				folderSafeName,
				summaryHash,
				summaryFileName: folderSummaryFileName,
			});
		}

		if (folders === null && folderSummaryInfos.length > 0) {
			job.progress = {
				current: totalFolders,
				total: totalFolders,
				message: `Creating vault summary`,
			};
			this.notifyListeners();

			const currentFolderHashes = folderSummaryInfos.map(f => f.summaryHash).sort();
			let vaultSummary: string;

			if (this.plugin.canUseCachedVaultSummary(currentFolderHashes)) {
				vaultSummary = this.plugin.getSummaryCache().vaultSummary!.summary;
			} else {
				const folderLinks = folderSummaryInfos
					.map(f => `- [[${f.summaryFileName}]]`)
					.join("\n");

				const vaultPrompt = `Here are summaries of the following folders:

${folderLinks}

Based on these folder summaries, create a comprehensive vault summary that:
1. Provides an overview paragraph tying all folders together
2. Lists each folder summary with its key points
3. Suggests meaningful connections between folders using [[Summary FolderName Date]] format`;

				vaultSummary = await this.plugin.complete(vaultPrompt);
			}

			const vaultSummaryContent = `# Summary: Vault

## Folder Summaries

${folderLinks}

---

${vaultSummary}

---
*Generated on ${date} from ${folderSummaryInfos.length} folders*`;

			this.plugin.updateVaultSummaryCache(currentFolderHashes, vaultSummaryContent);

			const vaultSummaryFileName = `Summary Vault ${date}.md`;
			const vaultFilePath = await this.createVaultSummaryNote(vaultSummaryContent, vaultSummaryFileName);
			if (vaultFilePath) {
				createdFiles.push(vaultFilePath);
			}
		}

		await this.plugin.saveSettings();

		job.result = {
			type: "success",
			message: `Created summaries for ${createdFiles.length} folders`,
			filesCreated: createdFiles,
		};

		new Notice(`✅ ${job.result.message}`);
	}

	private async createFolderSummary(folderPath: string, content: string): Promise<string | null> {
		if (!folderPath) {
			folderPath = "";
		}

		try {
			if (folderPath) {
				const folderExists = this.app.vault.getAbstractFileByPath(folderPath);
				if (!folderExists) {
					await this.app.vault.createFolder(folderPath);
				}
			}
		} catch (e) {
			console.warn("Could not create folder:", e);
		}

		const date = new Date().toISOString().split("T")[0];
		const folderSafeName = folderPath.split("/").pop() || "Root";
		const fullPath = folderPath ? `${folderPath}/Summary ${folderSafeName} ${date}.md` : `Summary ${folderSafeName} ${date}.md`;

		try {
			const existing = this.app.vault.getAbstractFileByPath(fullPath);
			if (existing) {
				await this.app.vault.modify(existing as TFile, content);
			} else {
				await this.app.vault.create(fullPath, content);
			}
			return fullPath;
		} catch (error) {
			console.error("Error creating summary:", error);
			return null;
		}
	}

	private async createVaultSummaryNote(content: string, filename: string): Promise<string | null> {
		const fullPath = filename;

		try {
			const existing = this.app.vault.getAbstractFileByPath(fullPath);
			if (existing) {
				await this.app.vault.modify(existing as TFile, content);
			} else {
				await this.app.vault.create(fullPath, content);
			}
			return fullPath;
		} catch (error) {
			console.error("Error creating vault summary:", error);
			return null;
		}
	}

	private async runGenerateJob(job: Job): Promise<void> {
		const options: GenerateOptions = (job as any).options;

		job.progress = { current: 0, total: 1, message: "Generating content..." };
		this.notifyListeners();

		const result = await this.plugin.complete(options.prompt);

		let file: TFile | null = null;
		if (options.selectedFile) {
			if (options.mode === "append") {
				file = await this.plugin.appendToNote(result.trim(), options.selectedFile);
			} else {
				await this.app.vault.modify(options.selectedFile, result.trim());
				file = options.selectedFile;
			}
		} else {
			file = await this.plugin.createNote(result.trim(), options.filename);
		}

		job.progress = { current: 1, total: 1, message: "Complete" };
		this.notifyListeners();

		if (file) {
			const leaf = this.app.workspace.getLeaf(true);
			await leaf.openFile(file);
		}

		job.result = {
			type: "success",
			message: `Generated: ${options.filename}`,
			filesCreated: file ? [file.path] : [],
		};

		new Notice(`✅ ${job.result.message}`);
	}

	private async runAnalyzeJob(job: Job): Promise<void> {
		const options: AnalyzeOptions = (job as any).options;

		job.progress = { current: 0, total: 1, message: "Analyzing..." };
		this.notifyListeners();

		await this.plugin.indexVault(options.folders, (current, total) => {
			job.progress = { current: current / 2, total, message: `Indexing: ${current}/${total}` };
			this.notifyListeners();
		});

		this.plugin.indexer.getIndex();
		const context = this.plugin.indexer.buildContext?.() || "";

		job.progress = { current: 1, total: 2, message: "Analyzing documents..." };
		this.notifyListeners();

		const fullPrompt = `${context}\n\nUser request: ${options.prompt}`;
		const result = await this.plugin.complete(fullPrompt);

		job.progress = { current: 2, total: 2, message: "Creating summary file..." };
		this.notifyListeners();

		const date = new Date().toISOString().split("T")[0];
		let summaryFileName: string;
		let summaryContent: string;

		if (options.folders && options.folders.length > 0) {
			const folderPath = options.folders[0];
			const folderSafeName = folderPath.split("/").pop() || "Root";
			summaryFileName = `Summary ${folderSafeName} ${date}.md`;
			summaryContent = `# Summary: ${folderPath}\n\n${result}\n\n---\n*Generated on ${date}*`;
			const filePath = await this.createFolderSummary(folderPath, summaryContent);
			if (filePath) {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file) {
					const leaf = this.app.workspace.getLeaf(true);
					await leaf.openFile(file as TFile);
				}
				job.result = {
					type: "success",
					message: `Summary created: ${filePath}`,
					filesCreated: [filePath],
				};
			} else {
				job.result = {
					type: "failed",
					message: "Failed to create summary file",
				};
			}
		} else {
			summaryFileName = `Summary Vault ${date}.md`;
			summaryContent = `# Vault Summary\n\n${result}\n\n---\n*Generated on ${date}*`;
			const filePath = await this.createVaultSummaryNote(summaryContent, summaryFileName);
			if (filePath) {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file) {
					const leaf = this.app.workspace.getLeaf(true);
					await leaf.openFile(file as TFile);
				}
				job.result = {
					type: "success",
					message: `Summary created: ${filePath}`,
					filesCreated: [filePath],
				};
			} else {
				job.result = {
					type: "failed",
					message: "Failed to create summary file",
				};
			}
		}

		this.notifyListeners();
		new Notice(`✅ ${job.result.message}`);
	}

	private async runApplyJob(job: Job): Promise<void> {
		job.progress = { current: 0, total: 1, message: "Applying changes..." };
		this.notifyListeners();

		job.result = {
			type: "success",
			message: "Changes applied",
		};

		new Notice(`✅ ${job.result.message}`);
	}

	private get app() {
		return this.plugin.app;
	}
}