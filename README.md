# Parallel Search for SillyTavern

A third-party UI extension and server plugin that adds Parallel web search to an **unmodified SillyTavern installation**. No core patch, fork, or official Web Search extension is required.

Maintainer: **[Rowan Aldean](https://github.com/RowanAldean), Developer Partnerships at Parallel Web Systems**. This is a vendor-maintained integration, not an official SillyTavern provider. Report integration bugs and compatibility problems in this repository; maintenance belongs here, not to SillyTavern's maintainers.

## Features

- `ParallelSearch` function tool: the model searches and receives page titles, URLs and excerpts.
- `/parallel-search query`: shows results immediately and also returns text to the slash-command pipeline.
- Search button for testing without a model.
- Per-user API key storage on the SillyTavern server; configurable result budget.
- Parallel Search Fast mode, a 15-second upstream timeout, and clear authentication, credit, rate-limit and connection errors.

This initial release does not provide automatic phrase triggers, image search, full-page extraction, or a provider entry in the official Web Search extension. It makes a fresh API request for every search; there is no result cache. Parallel API usage and model usage are billed separately by their providers. See [Parallel pricing](https://parallel.ai/pricing).

## Install both components

Requires Node.js 20+ and SillyTavern with function-tool support. See [validation](docs/VALIDATION.md) for the exact tested version and limits.

### 1. Server plugin

Stop SillyTavern. From your **SillyTavern root directory**, run:

```sh
git clone --branch v0.1.0 --depth 1 https://github.com/RowanAldean/sillytavern-parallel-search.git plugins/parallel-search
```

Set these existing entries in `config.yaml`:

```yaml
enableServerPlugins: true
enableServerPluginsAutoUpdate: false
```

Restart SillyTavern. Startup should report that the Parallel Search plugin loaded. This package has no npm dependencies and requires no build. Server plugins run with the permissions of the SillyTavern process; review code before enabling them. See [SillyTavern's server plugin guidance](https://docs.sillytavern.app/for-contributors/server-plugins/). Disabling plugin auto-update affects all installed server plugins; update them manually as appropriate.

### 2. Browser extension

In **Extensions → Install extension**, enter:

```text
https://github.com/RowanAldean/sillytavern-parallel-search
```

Alternatively, from the SillyTavern root, install the same release for all users:

```sh
git clone --branch v0.1.0 --depth 1 https://github.com/RowanAldean/sillytavern-parallel-search.git public/scripts/extensions/third-party/sillytavern-parallel-search
```

Reload the browser. Open **Extensions → Parallel Search**, enter your [Parallel API key](https://platform.parallel.ai/), and click **Save key**. The status must say “Server plugin connected. API key saved.”

Both installations are necessary: the UI sends authenticated requests to your SillyTavern server, and the server calls Parallel. The API key is never sent to a chat model.

## Use it

For a visible search without a model:

```text
/parallel-search NASA mission news
```

Click the result notification to dismiss it. To reuse the output in a script, chain another command using `{{pipe}}`.

For model-driven search:

1. Connect a model supporting function calling in **API Connections**.
2. Turn on **Enable function calling** in **AI Response Configuration**.
3. Leave **Enabled / expose ParallelSearch tool** checked in the extension.
4. In a new chat, send: “Use the ParallelSearch tool to find a recent NASA announcement. Summarize it and cite its source URL.”

Verify that **Tool calls: Parallel Search** appears above the response. A plausible answer alone does not establish that the tool ran. Models choose when to call tools; requesting a search does not guarantee a call. For the tested `gpt-5.6-luna` Chat Completion connection, **Reasoning Effort → Minimum** maps to `none` and is needed for tools; Auto returns an upstream compatibility error. Other models have different requirements.

## Credentials and data

- Credentials are saved in `data/<user-handle>/parallel-search-key.json`, outside the extension and plugin repositories. Unix file permissions are restricted to the owner; this is **not encrypted storage**. Protect your data directory and its backups. Windows permissions follow the host filesystem's ACLs.
- The status endpoint reports only whether a key exists. The plugin never returns the key or logs it. **Remove key** deletes this plugin's saved key for the current user; it does not revoke the key at Parallel.
- Queries and the result budget go to Parallel; retrieved results go to your configured chat model when using the function tool. The plugin adds no analytics.
- SillyTavern's existing authentication and CSRF protections cover the plugin routes. Each request uses the server-authenticated user's directory, not a client-provided user ID.
- Web excerpts are untrusted external content. Check sources before relying on an answer.

## Update or uninstall

Update **both copies** to the same release. For each clone: `git fetch --tags origin`, then `git checkout <release-tag>`. Restart the server and reload the browser. Browser auto-update is disabled in this package.

To uninstall, first use **Remove key** if you want to delete the saved credential. Disable/remove the browser extension in Manage Extensions, stop SillyTavern, and remove the `plugins/parallel-search` directory. For a manually installed UI copy, remove its directory too. Restart. No core files need restoring. Other SillyTavern credentials and chats are unaffected.

## Maintenance and contributions

Open an issue here with your SillyTavern version, plugin version, model/provider, reproduction steps and a **redacted** error. Never include API keys or complete network archives. For security reports, use GitHub's private vulnerability reporting when enabled; do not post credentials publicly.

Run `npm test` and `npm run check` before changes. Release validation should include a clean supported SillyTavern version, a live Parallel search, and a model-generated tool call. Future requests for core inclusion should begin with a public SillyTavern issue only if meaningful SillyTavern user demand develops. This release makes no request for core inclusion.

Licensed under AGPL-3.0-or-later. The bounded search adapter was adapted from the author's original SillyTavern proposal under the same license.
