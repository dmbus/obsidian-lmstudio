# LM Studio Copilot

A privacy-first Obsidian plugin that brings AI-powered document assistance to your vault using local LLMs via [LM Studio](https://lmstudio.ai/).

![Obsidian](https://img.shields.io/badge/Obsidian-1.5.0+-blueviolet)
![License](https://img.shields.io/badge/License-MIT-green)
![GitHub release](https://img.shields.io/github/v/release/dmbus/obsidian-lmstudio)

## Privacy First

All AI processing happens **locally** on your machine. Your documents never leave your vault - no cloud services, no external API calls (except to your local LM Studio instance), and no data collection.

## Features

### Document Assistant

- **Write new documents** with AI assistance using customizable prompts
- **Edit existing documents** - rewrite, append, or replace content
- **Combine documents** - merge multiple documents with AI help
- **Template system** - use pre-built templates or create your own

### Vault Assistant

- **Index your entire vault** for semantic search and analysis
- **Find connections** between documents and create wikilinks automatically
- **Summarize documents** or entire folders
- **Ask questions** about your vault content
- **Restructure suggestions** - get AI-powered recommendations for organizing your vault

### Customizable Templates

Create reusable prompt templates with dynamic variables:

```markdown
# Meeting: {{title}}

**Date:** {{date}}
**Attendees:** {{attendees}}

## Agenda
{{agenda}}

## Discussion
{{discussion}}
```

## Prerequisites

- [Obsidian](https://obsidian.md/) (desktop app, version 1.5.0+)
- [LM Studio](https://lmstudio.ai/) running locally with a model loaded

## Installation

### Community Plugin (Recommended)

1. Open Obsidian Settings
2. Go to Community Plugins and enable third-party plugins
3. Search for "LM Studio Copilot"
4. Install and enable the plugin

### Manual Installation

1. Clone this repository or download the latest release
2. Run `npm install` to install dependencies
3. Run `npm run build` to build the plugin
4. Copy `dist/main.js`, `dist/styles.css`, and `dist/manifest.json` to your vault's `.obsidian/plugins/lm-studio-copilot/` folder
5. Enable the plugin in Obsidian Settings

## Configuration

1. Open Obsidian Settings → LM Studio Copilot
2. Configure your LM Studio server URL (default: `http://127.0.0.1:1234/v1`)
3. Set your model name (default: `local-model`)
4. Adjust other settings as needed

### Settings Overview

| Setting | Description | Default |
|---------|-------------|---------|
| Server URL | LM Studio API endpoint | `http://127.0.0.1:1234/v1` |
| Model Name | Model to use for completions | `local-model` |
| Output Folder | Where AI-generated docs are saved | `AI Generated` |
| Auto-index on startup | Index vault when Obsidian opens | `true` |
| Periodic re-index | How often to re-index vault | `off` |

## Usage

### Command Palette

The plugin registers several commands accessible via `Ctrl/Cmd + P`:

- **Open AI Document Assistant** - Opens the document editing modal
- **Write new document with AI** - Start a new document from scratch
- **Edit document with AI** - Edit the currently active file
- **Combine selected documents** - Merge multiple documents
- **Open Vault Assistant** - Access vault-wide AI features
- **Re-index vault** - Manually trigger vault indexing

### Ribbon Icons

Two ribbon icons provide quick access:

- **File-text icon** - Opens Document Assistant
- **Brain icon** - Opens Vault Assistant

### Document Assistant Modes

1. **Edit/Rewrite** - Modify existing content
2. **Append** - Add new content to end of document
3. **Replace** - Replace entire document content

### Vault Assistant Features

1. **Find Connections** - Discover related documents and create backlinks
2. **Answer Question** - Ask questions about your vault content
3. **Summarize Vault** - Generate comprehensive summaries
4. **Restructure Vault** - Get organization recommendations

## Templates

### Built-in Document Templates

- **Meeting Notes** - Structured meeting documentation
- **Summary** - Concise document summaries
- **Expand** - Expand brief content with detail

### Built-in Vault Templates

- **Find Connections** - Discover document relationships
- **Answer Question** - Query your vault knowledge
- **Summarize Vault** - Overview of all documents
- **Restructure Vault** - Organization recommendations

### Creating Custom Templates

1. Go to Settings → LM Studio Copilot → Prompt Templates or Vault Templates
2. Click "Add Template"
3. Define template name and content
4. Use `{{variable}}` syntax for dynamic values

Example:

```
Summarize the following content concisely:

{{content}}
```

## Security

- **Local processing only** - All AI operations use your local LM Studio instance
- **No data exfiltration** - Documents stay in your vault
- **Path validation** - Prevents directory traversal attacks
- **Input sanitization** - Protects against injection attacks
- **No external API calls** - Except to your local LM Studio server

## Troubleshooting

### "Connection failed" error

1. Make sure LM Studio is running
2. Verify the server URL in plugin settings
3. Check that a model is loaded in LM Studio
4. Ensure LM Studio has "Server" enabled (local API)

### Plugin not appearing

1. Verify the plugin folder is in `.obsidian/plugins/`
2. Check that `manifest.json`, `main.js`, and `styles.css` are present
3. Try reloading Obsidian

### Vault indexing slow

1. Large vaults take time to index
2. Consider limiting indexed folders in settings
3. Disable auto-index on startup for large vaults

## Development

```bash
# Install dependencies
npm install

# Development build with watch mode
npm run dev

# Production build
npm run build

# Lint code
npm run lint

# Run tests
npm test
```

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Obsidian](https://obsidian.md/) for the amazing note-taking platform
- [LM Studio](https://lmstudio.ai/) for making local LLM deployment easy