# agent-wrangler-handoff-skill

An [Agent Wrangler](https://github.com/PortSwigger/agent-wrangler) extension that ships one skill, `handoff`.

A session that is broken in a way the CLI can't fix, is near its context ceiling, or should move to a different agent provider (Claude ↔ Codex) or model invokes the skill. In Claude Code that's `/handoff:handoff`, because an extension-shipped skill loads as a one-skill plugin named after its directory. The session then:

1. writes a handoff file (why, what's done, current state, git status, session links, dependents, and any project conventions that won't carry across providers)
2. spawns a successor in the same working tree, with the requested `agent`, `model`, `auto_compact_tokens` and `effort`
3. gives the successor its own card title, unchanged, and stops

The successor re-attaches the session links, tells every dependent session (nested children, sessions it spawned, and its parent and spawner) to report to the successor from now on, and then archives its predecessor with `archive_children: false`.

See [`skills/handoff/SKILL.md`](skills/handoff/SKILL.md) for the full procedure.

This is the first real Agent Wrangler extension. It was built partly to exercise the extension install path: git-URL clone, lockfile, provenance and manifest validation. It needs no host capabilities (`requires: []`) and adds no tools or hooks, only a skill.

## Install

In Agent Wrangler's settings, go to the Extensions tab. Paste this URL into **Install an extension**, choose **Install…**, and approve the consent dialog. The dialog shows no capabilities and no dependencies.

```
https://github.com/psjamesh/agent-wrangler-handoff-skill
```

The extension is enabled by default. Sessions launched after the install pick up the skill.

## Layout

- `index.js`: the manifest, a plain default-exported object.
- `package.json`: its `wranglerExtension` block is the static declaration shown before consent. It has to match the manifest's `id` and `requires`.
- `package-lock.json`: required by the installer, even with no dependencies.
- `skills/handoff/SKILL.md`: the skill.
