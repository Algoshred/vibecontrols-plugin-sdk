# Plugin Integration Docs

These documents are the canonical integration guide for `@vibecontrols/vibe-plugin-*` packages. They live inside the plugin-SDK repo so they version with the contract surface.

| Doc                                                                          | Use when                                                                           |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`README.md`](./README.md)                                                   | Orienting yourself to the plugin system at a glance                                |
| [`HOW_TO_INTEGRATE_VIBE_PLUGINS.md`](./HOW_TO_INTEGRATE_VIBE_PLUGINS.md)     | You are writing a brand-new vibe-plugin                                            |
| [`PLUGIN_CATALOG.md`](./PLUGIN_CATALOG.md)                                   | You need a one-page list of every published plugin and what it does                |
| [`VIBE_PLUGINS_GUIDE_FOR_AI_TOOLS.md`](./VIBE_PLUGINS_GUIDE_FOR_AI_TOOLS.md) | You are an AI agent (Claude / Codex / Cursor / Gemini etc.) generating plugin code |
| [`VIBE_PLUGIN_PROMPT_GUIDE.md`](./VIBE_PLUGIN_PROMPT_GUIDE.md)               | You are writing prompts that instruct an AI to build / modify plugins              |
| [`VIBE_PLUGIN_TESTING_CHECKLIST.md`](./VIBE_PLUGIN_TESTING_CHECKLIST.md)     | You are reviewing a plugin PR or running pre-release smoke tests                   |
| [`gitops.md`](./gitops.md)                                                   | You are extending the gitops meta plugin with a new SCM provider                   |

## Important: agent is not open source

These docs describe the contract between plugins and the `@vibecontrols/agent` runtime. The agent itself is **proprietary** to Burdenoff Consultancy Services Pvt. Ltd. Only the plugin SDK and the plugins themselves are released under the MIT License. If you want a fully self-hostable agent, please open an issue against this repo or contact the maintainer.

## Resources

- Website: <https://vibecontrols.com>
- Docs site: <https://docs.vibecontrols.com>
- Plugin SDK: <https://github.com/algoshred/vibecontrols-plugin-sdk>
- All plugins: <https://github.com/algoshred?q=vibe-plugin-&type=all>
- Maintainer: **Vignesh T.V** — <https://github.com/tvvignesh>

Released under the [MIT License](../../LICENSE).
