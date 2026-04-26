import { describe, it, expect } from 'vitest';

describe('ObsidianLMStudioPlugin', () => {
	describe('substituteTemplate', () => {
		it('should substitute single variable', () => {
			const template = 'Hello {{name}}!';
			const variables = { name: 'World' };
			const result = substituteTemplate(template, variables);
			expect(result).toBe('Hello World!');
		});

		it('should substitute multiple variables', () => {
			const template = '{{greeting}} {{name}}, today is {{date}}';
			const variables = { greeting: 'Hello', name: 'World', date: 'Monday' };
			const result = substituteTemplate(template, variables);
			expect(result).toBe('Hello World, today is Monday');
		});

		it('should not substitute undefined variables', () => {
			const template = 'Hello {{name}}, your email is {{email}}';
			const variables = { name: 'World' };
			const result = substituteTemplate(template, variables);
			expect(result).toBe('Hello World, your email is {{email}}');
		});

		it('should handle repeated variables', () => {
			const template = '{{name}} said hello to {{name}}';
			const variables = { name: 'Alice' };
			const result = substituteTemplate(template, variables);
			expect(result).toBe('Alice said hello to Alice');
		});

		it('should handle empty template', () => {
			const template = '';
			const variables = { name: 'World' };
			const result = substituteTemplate(template, variables);
			expect(result).toBe('');
		});
	});
});

function substituteTemplate(template: string, variables: Record<string, string>): string {
	let result = template;
	for (const [key, value] of Object.entries(variables)) {
		result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
	}
	return result;
}
