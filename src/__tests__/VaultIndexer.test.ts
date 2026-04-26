import { describe, it, expect } from 'vitest';

function generateSummary(content: string, maxLength: number = 500): string {
	if (content.length <= maxLength) {
		const lines = content.split('\n');
		if (lines.length <= 10) return content;
		const first5 = lines.slice(0, 5).join('\n');
		const last5 = lines.slice(-5).join('\n');
		return `${first5}\n...\n${last5}`;
	}
	const truncated = content.substring(0, maxLength);
	const lastNewline = truncated.lastIndexOf('\n');
	const safeTruncate = lastNewline > maxLength * 0.8 ? truncated.substring(0, lastNewline) : truncated;
	return `${safeTruncate}...`;
}

function extractHeadings(content: string, maxHeadings: number = 20): string[] {
	const headingRegex = /^#{1,6}\s+(.+)$/gm;
	const headings: string[] = [];
	let match;
	while ((match = headingRegex.exec(content)) !== null && headings.length < maxHeadings) {
		headings.push(match[1]);
	}
	return headings;
}

function generateId(path: string): string {
	let hash = 0;
	for (let i = 0; i < path.length; i++) {
		const char = path.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash;
	}
	return Math.abs(hash).toString(36);
}

describe('VaultIndexer Helpers', () => {
	describe('generateSummary', () => {
		it('should return short content unchanged', () => {
			const content = 'Line 1\nLine 2\nLine 3';
			const summary = generateSummary(content);
			expect(summary).toBe(content);
		});

		it('should truncate long content with ellipsis', () => {
			const longContent = 'A'.repeat(600);
			const summary = generateSummary(longContent);
			expect(summary.length).toBeLessThanOrEqual(503);
			expect(summary).toContain('...');
		});

		it('should use first and last lines for medium content', () => {
			const lines = Array.from({ length: 15 }, (_, i) => `Line ${i + 1}`);
			const content = lines.join('\n');
			const summary = generateSummary(content);
			expect(summary).toContain('Line 1');
			expect(summary).toContain('Line 15');
			expect(summary).toContain('...');
		});
	});

	describe('extractHeadings', () => {
		it('should extract headings from markdown content', () => {
			const content = `# Heading 1\n\n## Heading 2\n\n### Heading 3\n\nParagraph`;
			const headings = extractHeadings(content);
			expect(headings).toContain('Heading 1');
			expect(headings).toContain('Heading 2');
			expect(headings).toContain('Heading 3');
		});

		it('should return empty array for content without headings', () => {
			const content = 'Just some text without headings';
			const headings = extractHeadings(content);
			expect(headings).toEqual([]);
		});

		it('should limit to maxHeadings', () => {
			const content = Array.from({ length: 25 }, (_, i) => `# Heading ${i}`).join('\n');
			const headings = extractHeadings(content);
			expect(headings.length).toBe(20);
		});

		it('should handle h1 through h6', () => {
			const content = `# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6`;
			const headings = extractHeadings(content);
			expect(headings.length).toBe(6);
		});
	});

	describe('generateId', () => {
		it('should generate consistent IDs for same path', () => {
			const id1 = generateId('/path/to/file.md');
			const id2 = generateId('/path/to/file.md');
			expect(id1).toBe(id2);
		});

		it('should generate different IDs for different paths', () => {
			const id1 = generateId('/path/to/file1.md');
			const id2 = generateId('/path/to/file2.md');
			expect(id1).not.toBe(id2);
		});

		it('should handle special characters in path', () => {
			const id = generateId('/path/with spaces & symbols/file.md');
			expect(typeof id).toBe('string');
			expect(id.length).toBeGreaterThan(0);
		});
	});
});

describe('Search Logic', () => {
	describe('keyword search', () => {
		it('should find matching documents by keyword', () => {
			const documents = [
				{ id: '1', title: 'Meeting Notes', content: 'Discussed project timeline', path: '/meeting.md' },
				{ id: '2', title: 'Project Plan', content: 'Main goals for Q1', path: '/project.md' },
				{ id: '3', title: 'Notes', content: 'Quick notes from meeting', path: '/notes.md' },
			];
			const keyword = 'meeting';
			const results = documents.filter(doc =>
				doc.title.toLowerCase().includes(keyword) ||
				doc.content.toLowerCase().includes(keyword)
			);
			expect(results.length).toBe(2);
		});

		it('should be case insensitive', () => {
			const documents = [
				{ id: '1', title: 'Meeting Notes', content: 'Discussed project', path: '/meeting.md' },
			];
			const results = documents.filter(doc =>
				doc.title.toLowerCase().includes('meeting')
			);
			expect(results.length).toBe(1);
		});
	});

	describe('folder filtering', () => {
		it('should filter documents by folder path', () => {
			const documents = [
				{ id: '1', title: 'Doc1', content: '', path: '/folder1/doc1.md' },
				{ id: '2', title: 'Doc2', content: '', path: '/folder1/doc2.md' },
				{ id: '3', title: 'Doc3', content: '', path: '/folder2/doc3.md' },
			];
			const folderDocs = documents.filter(doc => doc.path.startsWith('/folder1/'));
			expect(folderDocs.length).toBe(2);
		});
	});
});
