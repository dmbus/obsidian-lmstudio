import { App, Modal, Notice, setIcon } from "obsidian";
import { Job, JobQueueManager } from "./JobQueueManager";

export class JobHistoryModal extends Modal {
	private queueManager: JobQueueManager;
	private contentEl: HTMLElement;

	constructor(app: App, queueManager: JobQueueManager) {
		super(app);
		this.queueManager = queueManager;
	}

	onOpen() {
		const { titleEl, contentEl } = this;
		titleEl.setText("AI Job Queue");

		contentEl.style.cssText = "padding: 16px;";

		this.renderContent(contentEl);

		this.queueManager.onStatusChange(() => {
			this.renderContent(contentEl);
		});
	}

	private renderContent(container: HTMLElement) {
		container.empty();

		const jobs = this.queueManager.getDisplayJobs();
		const runningJob = jobs.find((j) => j.status === "running");
		const pendingJobs = jobs.filter((j) => j.status === "pending");
		const historyJobs = jobs.filter((j) =>
			j.status === "completed" || j.status === "failed" || j.status === "cancelled"
		);

		if (jobs.length === 0) {
			const emptyEl = container.createDiv();
			emptyEl.style.cssText = "text-align: center; color: var(--text-muted); padding: 40px 0;";
			emptyEl.setText("No jobs in queue");
			return;
		}

		if (runningJob) {
			const runningSection = this.createSection(container, "Running");
			this.renderJob(runningSection, runningJob, true);
		}

		if (pendingJobs.length > 0) {
			const pendingSection = this.createSection(container, `Pending (${pendingJobs.length})`);
			for (const job of pendingJobs) {
				this.renderJob(pendingSection, job, true);
			}
		}

		if (historyJobs.length > 0) {
			const historySection = this.createSection(container, "History");
			for (const job of historyJobs.reverse()) {
				this.renderJob(historySection, job, false);
			}
		}

		const buttonRow = container.createDiv();
		buttonRow.style.cssText = "display: flex; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--background-modifier-border);";
		buttonRow.style.float = "right";

		if (historyJobs.length > 0) {
			const clearBtn = buttonRow.createEl("button", { text: "Clear History" });
			clearBtn.style.cssText = "padding: 8px 16px; background: var(--background-modifier-border); border: none; border-radius: 4px; cursor: pointer;";
			clearBtn.onclick = () => {
				this.queueManager.clearHistory();
				this.renderContent(container);
			};
		}

		const closeBtn = buttonRow.createEl("button", { text: "Close" });
		closeBtn.style.cssText = "padding: 8px 16px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 4px; cursor: pointer;";
		closeBtn.onclick = () => this.close();
	}

	private createSection(container: HTMLElement, title: string): HTMLElement {
		const section = container.createDiv();
		section.style.cssText = "margin-bottom: 16px;";

		const titleEl = section.createDiv();
		titleEl.style.cssText = "font-weight: 600; margin-bottom: 8px; color: var(--text-normal);";
		titleEl.setText(title);

		const list = section.createDiv();
		list.style.cssText = "display: flex; flex-direction: column; gap: 8px;";

		return list;
	}

	private renderJob(container: HTMLElement, job: Job, showActions: boolean): void {
		const item = container.createDiv();
		item.style.cssText = "padding: 12px; background: var(--background-secondary); border-radius: 6px;";

		const header = item.createDiv();
		header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;";

		const statusIcon = header.createDiv();
		statusIcon.style.cssText = "width: 20px; height: 20px; margin-right: 8px; display: inline-flex; align-items: center; justify-content: center;";

		const iconName = this.getStatusIcon(job.status);
		setIcon(statusIcon.createSpan(), iconName);

		const descEl = header.createDiv();
		descEl.style.cssText = "flex: 1; font-weight: 500;";
		descEl.setText(job.description);

		if (job.status === "running" && job.progress) {
			const progressEl = item.createDiv();
			progressEl.style.cssText = "font-size: 0.85em; color: var(--text-muted); margin-top: 4px;";
			progressEl.setText(job.progress.message || `${job.progress.current}/${job.progress.total}`);
		}

		if (job.result) {
			const resultEl = item.createDiv();
			resultEl.style.cssText = "font-size: 0.85em; color: var(--text-muted); margin-top: 4px;";
			resultEl.setText(job.result.message);
		}

		if (job.error) {
			const errorEl = item.createDiv();
			errorEl.style.cssText = "font-size: 0.85em; color: var(--text-error); margin-top: 4px;";
			errorEl.setText(job.error);
		}

		const timeEl = item.createDiv();
		timeEl.style.cssText = "font-size: 0.75em; color: var(--text-muted); margin-top: 4px;";
		timeEl.setText(this.formatTime(job));

		if (showActions && (job.status === "pending" || job.status === "running")) {
			const cancelBtn = item.createEl("button", { text: "Cancel" });
			cancelBtn.style.cssText = "margin-top: 8px; padding: 4px 12px; background: var(--background-modifier-error); color: var(--text-on-error); border: none; border-radius: 4px; cursor: pointer; font-size: 0.85em;";
			cancelBtn.onclick = () => {
				this.queueManager.cancelJob(job.id);
				new Notice(`Cancelled: ${job.description}`);
			};
		}
	}

	private getStatusIcon(status: string): string {
		switch (status) {
			case "pending":
				return "circle";
			case "running":
				return "loader";
			case "completed":
				return "check-circle";
			case "failed":
				return "x-circle";
			case "cancelled":
				return "minus-circle";
			default:
				return "circle";
		}
	}

	private formatTime(job: Job): string {
		const now = Date.now();
		let time: number;

		if (job.completedAt) {
			time = job.completedAt;
		} else if (job.startedAt) {
			time = job.startedAt;
		} else {
			time = job.createdAt;
		}

		const diff = now - time;
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (seconds < 60) {
			return "Just now";
		} else if (minutes < 60) {
			return `${minutes}m ago`;
		} else if (hours < 24) {
			return `${hours}h ago`;
		} else {
			return new Date(time).toLocaleDateString();
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}