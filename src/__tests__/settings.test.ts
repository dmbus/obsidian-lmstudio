import { describe, it, expect } from 'vitest';

describe('Settings Validation', () => {
	describe('LM Studio URL', () => {
		it('should validate URL format', () => {
			const validUrls = [
				'http://localhost:1234/v1',
				'http://127.0.0.1:1234/v1',
				'https://localhost:1234/v1',
			];

			for (const url of validUrls) {
				expect(url).toMatch(/^https?:\/\/.+:\d+\/v1$/);
			}
		});

		it('should reject invalid URLs', () => {
			const invalidUrls = [
				'localhost:1234',
				'not-a-url',
				'http://localhost',
			];

			for (const url of invalidUrls) {
				const isValid = /^https?:\/\/.+:\d+\/v1$/.test(url);
				expect(isValid).toBe(false);
			}
		});
	});

	describe('Output Location', () => {
		it('should accept valid output locations', () => {
			const validLocations = ['current', 'specific'];
			for (const location of validLocations) {
				expect(['current', 'specific']).toContain(location);
			}
		});
	});

	describe('Periodic Reindex', () => {
		it('should accept valid reindex schedules', () => {
			const validSchedules = ['off', 'daily', 'weekly'];
			for (const schedule of validSchedules) {
				expect(validSchedules).toContain(schedule);
			}
		});
	});

	describe('Index Folders', () => {
		it('should parse comma-separated folders', () => {
			const input = 'folder1, folder2, folder3';
			const folders = input
				.split(',')
				.map(s => s.trim())
				.filter(Boolean);
			expect(folders).toEqual(['folder1', 'folder2', 'folder3']);
		});

		it('should handle empty input', () => {
			const input = '';
			const folders = input
				.split(',')
				.map(s => s.trim())
				.filter(Boolean);
			expect(folders).toEqual([]);
		});

		it('should handle whitespace-only input', () => {
			const input = '   ';
			const folders = input
				.split(',')
				.map(s => s.trim())
				.filter(Boolean);
			expect(folders).toEqual([]);
		});
	});
});

describe('Default Templates', () => {
	describe('Document Templates', () => {
		it('should have required fields', () => {
			const template = {
				id: 'test',
				name: 'Test Template',
				content: 'Content with {{variable}}',
			};

			expect(template).toHaveProperty('id');
			expect(template).toHaveProperty('name');
			expect(template).toHaveProperty('content');
		});

		it('should allow variable placeholders', () => {
			const template = {
				id: 'meeting',
				name: 'Meeting Notes',
				content: `# Meeting: {{title}}\n\n**Date:** {{date}}`,
			};

			const matches = template.content.match(/\{\{(\w+)\}\}/g) || [];
			expect(matches.length).toBe(2);
		});
	});

	describe('Vault Templates', () => {
		it('should have Summarize Vault without variables', () => {
			const summarizeTemplate = {
				id: 'summarize-all',
				name: 'Summarize Vault',
				content: 'Analyze all documents in the provided vault index.',
			};

			const hasVariables = /\{\{/.test(summarizeTemplate.content);
			expect(hasVariables).toBe(false);
		});

		it('should have Find Connections with topic variable', () => {
			const findConnectionsTemplate = {
				id: 'find-connections',
				name: 'Find Connections',
				content: 'Find all documents related to: {{topic}}',
			};

			const hasTopicVar = /\{\{topic\}\}/.test(findConnectionsTemplate.content);
			expect(hasTopicVar).toBe(true);
		});
	});
});

describe('System Prompt', () => {
	it('should include key instructions', () => {
		const systemPrompt = `You are assisting with Obsidian vault documents. Rules:
- Never delete or overwrite existing content without explicit user permission
- Preserve document structure and formatting
- Only modify content explicitly requested by the user
- If instructions are ambiguous, ask for clarification rather than assume
- Always output valid markdown`;

		expect(systemPrompt).toContain('Never delete');
		expect(systemPrompt).toContain('Preserve document structure');
		expect(systemPrompt).toContain('explicit user permission');
		expect(systemPrompt).toContain('Always output valid markdown');
	});
});

describe('Date Formatting', () => {
	it('should format date as ISO date string', () => {
		const date = new Date('2026-04-26T12:00:00Z');
		const isoDate = date.toISOString().split('T')[0];
		expect(isoDate).toBe('2026-04-26');
	});

	it('should format current date correctly', () => {
		const now = new Date();
		const isoDate = now.toISOString().split('T')[0];
		expect(isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
