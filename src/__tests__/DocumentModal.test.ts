import { describe, it, expect } from 'vitest';

describe('Template Variable Parsing', () => {
	describe('Variable Extraction', () => {
		it('should extract single variable', () => {
			const content = 'Hello {{name}}!';
			const matches = content.match(/\{\{(\w+)\}\}/g) || [];
			const varNames = matches.map(m => m.replace(/\{\{|\}\}/g, ''));
			expect(varNames).toEqual(['name']);
		});

		it('should extract multiple variables', () => {
			const content = '{{greeting}} {{name}}, today is {{date}}';
			const matches = content.match(/\{\{(\w+)\}\}/g) || [];
			const varNames = matches.map(m => m.replace(/\{\{|\}\}/g, ''));
			expect(varNames).toEqual(['greeting', 'name', 'date']);
		});

		it('should handle repeated variables', () => {
			const content = '{{name}} said hello to {{name}}';
			const matches = content.match(/\{\{(\w+)\}\}/g) || [];
			const seen = new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')));
			expect(Array.from(seen)).toEqual(['name']);
		});

		it('should return empty for no variables', () => {
			const content = 'No variables here';
			const matches = content.match(/\{\{(\w+)\}\}/g) || [];
			expect(matches).toEqual([]);
		});

		it('should handle variables with underscores', () => {
			const content = '{{topic_name}} and {{another_var}}';
			const matches = content.match(/\{\{(\w+)\}\}/g) || [];
			const varNames = matches.map(m => m.replace(/\{\{|\}\}/g, ''));
			expect(varNames).toEqual(['topic_name', 'another_var']);
		});
	});

	describe('Template Substitution', () => {
		it('should substitute variables correctly', () => {
			const template = 'Hello {{name}}!';
			const variables = { name: 'World' };
			let result = template;
			for (const [key, value] of Object.entries(variables)) {
				result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
			}
			expect(result).toBe('Hello World!');
		});

		it('should substitute multiple variables', () => {
			const template = '{{greeting}} {{name}}!';
			const variables = { greeting: 'Hi', name: 'Alice' };
			let result = template;
			for (const [key, value] of Object.entries(variables)) {
				result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
			}
			expect(result).toBe('Hi Alice!');
		});
	});

	describe('Wikilink Parsing', () => {
		it('should parse wikilinks from text', () => {
			const text = 'Check [[Document One]] and [[Document Two|Second Doc]]';
			const wikilinks = text.match(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g) || [];
			expect(wikilinks.length).toBe(2);
			expect(wikilinks[0]).toBe('[[Document One]]');
			expect(wikilinks[1]).toBe('[[Document Two|Second Doc]]');
		});

		it('should extract wikilink components', () => {
			const wikilink = '[[Document Name|Display Text]]';
			const match = wikilink.match(/\[\[([^\]|]+)\|?([^\]]*)\]\]/);
			expect(match).not.toBe(null);
			expect(match![1]).toBe('Document Name');
			expect(match![2]).toBe('Display Text');
		});

		it('should handle wikilink without display text', () => {
			const wikilink = '[[Document Only]]';
			const match = wikilink.match(/\[\[([^\]|]+)\|?([^\]]*)\]\]/);
			expect(match).not.toBe(null);
			expect(match![1]).toBe('Document Only');
			expect(match![2]).toBe('');
		});
	});
});

describe('Proposed Changes Parsing', () => {
	describe('Wikilink Changes', () => {
		it('should identify wikilink pairs in result', () => {
			const result = `Based on my analysis:

1. [[Meeting Notes]] relates to [[Project Roadmap]] because they discuss the same milestones.

2. [[Meeting Notes]] also connects to [[Sprint Board]] as it references sprint status.

I recommend creating a summary document.`;

			const wikilinkMatches = result.match(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g) || [];
			expect(wikilinkMatches.length).toBe(4);
		});
	});

	describe('New Document Changes', () => {
		it('should identify create document instructions', () => {
			const result = `I recommend creating a new document called "Project Summary" that consolidates all findings.`;

			const hasCreateDoc = result.toLowerCase().includes('creating') ||
				(result.toLowerCase().includes('create') && result.toLowerCase().includes('document'));
			expect(hasCreateDoc).toBe(true);
		});
	});
});

describe('Content Truncation', () => {
	const MAX_LENGTH = 10000;

	it('should truncate content exceeding max length', () => {
		const longContent = 'A'.repeat(15000);
		let truncated = longContent;
		if (truncated.length > MAX_LENGTH) {
			truncated = truncated.substring(0, MAX_LENGTH) + '\n\n[Document truncated due to length]';
		}
		expect(truncated.length).toBeLessThanOrEqual(MAX_LENGTH + 50);
		expect(truncated).toContain('[Document truncated due to length]');
	});

	it('should not truncate short content', () => {
		const shortContent = 'Short content';
		let truncated = shortContent;
		if (truncated.length > MAX_LENGTH) {
			truncated = truncated.substring(0, MAX_LENGTH) + '\n\n[Document truncated due to length]';
		}
		expect(truncated).toBe('Short content');
	});
});
