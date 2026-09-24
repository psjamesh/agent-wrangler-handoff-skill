---
name: handoff
description: Use when this session should hand its work to a brand-new successor session it spawns itself — it is broken or deficient in a way the CLI cannot fix, is near its context ceiling, or the work should move to a different agent provider (Claude <-> Codex) or model. Takes optional agent, model, auto_compact_tokens and effort.
---

# Handoff

Hand your work to a fresh **successor** session that you spawn yourself, then stop. There
are only two sessions involved: you (the **predecessor**, running this skill on yourself)
and the successor. No third coordinator session — you may be in a bad state, so your side
is kept to a short, fixed sequence of calls, and everything that can wait (re-linking,
notifying dependents, archiving you) is done by the successor once it is healthy.

## Arguments

The human invokes the skill, optionally with any of the arguments below. In Claude Code it's `/handoff:handoff`, because an extension-shipped skill loads as a one-skill plugin named after its directory. In Codex it's `handoff` from the skill catalog.

- **`agent`** — `claude` or `codex`. **This is a first-class reason to hand off, not an
  afterthought**: moving the work to the other provider is one of the main uses of this
  skill. Omit to keep your own agent.
- **`model`** — must be valid for the target `agent` (see the `spawn-session` skill's
  table, or `spawn_session`'s own `model` description). **Pass it explicitly on a
  cross-provider handoff.** `spawn_session` only inherits your model when the successor
  runs the same agent as you; across providers an unset `model` lands on that agent's
  ambient default.
- **`auto_compact_tokens`** — the successor's auto-compaction ceiling. Claude accepts
  100000–1000000, Codex 50000–1000000.
- **`effort`** — reasoning effort. The same inheritance rule as `model` applies: it only
  carries across a same-agent spawn.
- A free-text **reason**. If none is given, write your own.

If an argument is invalid for the target agent, for example `model: "opus"` with
`agent: "codex"`, stop and ask. Don't guess.

## Precondition: not a workflow session

**Do not run this skill on a workflow orchestrator or a workflow-tracked worker.** That
includes a session launched by `spawn_workflow`, one told to report phases with
`workflow_phase`, an autopilot issue→PR run, or a session orchestrating tracked workers.
Replacing one of those breaks the workflow's own bookkeeping, and v1 does not handle it.
Tell the human to intervene by hand instead.

Neither `get_session_info` nor `list_sessions` exposes a workflow marker today. Decide
from what you know about your own launch: your launch prompt, and whether you have been
calling `workflow_phase` or spawning tracked workers.

## Your side (the predecessor)

Do these in order, then stop.

### 1. Drain your mailbox

`read_mail()`. Fold anything relevant into the handoff file. The successor gets a fresh
mailbox, and mail sent to you after you are archived is lost.

### 2. Collect your session links

`get_links({ scope: "session" })`. You only need the session scope. Task-scoped links
are keyed by task id, not session id, and the successor joins your task automatically,
so they carry over with no action.

### 3. Find your dependents

- `get_session_info()`: note your own `sessionId`, `label`, `parent`, `spawnedBy` and
  `autoCompactTokens`.
- `list_sessions()`: collect the rows where `parentSession` is your id (nested children)
  and the rows where `spawnedBy` is your id (sessions you launched without nesting). One
  session can appear in both sets, so deduplicate by `sessionId`. Also note each row's
  `label`, `agent` and `cwd`.

Your own `parent` and `spawnedBy`, if set, are dependents too, pointing upward. They need
to learn that the successor replaces you.

### 4. Record the working-tree state

In your cwd, run `git status --short`, `git rev-parse --abbrev-ref HEAD` and
`git rev-parse --short HEAD`. If the cwd is not a git repository, say so. Either way the
handoff file must state clearly whether uncommitted work exists, because the successor
continues in the **same** working tree.

### 5. Write the handoff file

Put the handoff in a file. **Do not put it in the spawn `intent`**: an unbounded intent
becomes an unreadable card title and an unbounded launch prompt.

```sh
dir="$(dirname "${AW_TASK_MEMORY:-${TMPDIR:-/tmp}/aw-handoff/x}")/handover-files"
mkdir -p "$dir"
file="$dir/handoff-${AW_SESSION_ID:0:8}.md"
```

`dirname "$AW_TASK_MEMORY"` is your task's memory directory, or your per-session scratch
memory directory when you have no task. Either way it is writable by you and by a Codex
sandbox. The file is the successor's source of truth. It contains:

- **Why** you are handing off, in your own words. Be specific about what is broken or
  deficient, so the successor doesn't repeat it.
- **What is done**, and **what remains**, as concrete next steps.
- **Current state**: key files and paths, decisions made and why, dead ends already
  ruled out, and anything half-finished.
- **Working tree**: branch, HEAD and the `git status --short` output from step 4.
- **Session links** from step 2, as `{type, key, url}` for each one, so the successor can
  re-set them.
- **Dependents** from step 3: id, label and relation (nested child, spawned by you, your
  parent, your spawner).
- **Who you report to and what you owe them.** Name the session you send results to
  (usually your `spawnedBy`, sometimes your `parent`) and what you had promised to report.
  The successor's own `AW_SPAWNER_SESSION_ID` will be *you*, so it has no other way to
  find out where your reports were going.
- **Mail** from step 1 that still matters.
- **Binding project conventions that won't transfer.** If this repo has rules you are
  following that live in agent-specific files (CLAUDE.md, AGENTS.md, a user-level
  CLAUDE.md, provider-specific memory), restate them here explicitly. A successor on a
  different provider inherits none of them any other way. This matters most on a
  cross-provider handoff, but write it every time.

### 6. Spawn the successor, once

`spawn_session` with:

- **`cwd`**: your own cwd. **Leave `worktree` unset.** This continues the work in the
  same working tree; it is not a fresh start.
- **`agent`**, **`model`** and **`effort`**: whatever the caller passed. Omit any that
  weren't given.
- **`auto_compact_tokens`**: the caller's value. Failing that, use your own
  `autoCompactTokens` from step 3, **but only when it is non-null and valid for the
  target agent**. Otherwise omit it and let the provider default apply.
- **`add_dirs`**: `[<the handover-files directory>]`. The file is outside the
  successor's cwd, and this makes it readable (and, for Codex, writable) without a
  prompt.
- Leave **`nest`** and **`into`** unset. The successor is a plain top-level session on
  your task, like you.
- **`intent`**: see the template below. It is literal prose, not "follow the handoff
  skill". The successor may be a different provider and cannot be assumed to have this
  skill.

### 7. Give it your title

`rename_session({ target: <successor id>, name: <your own label from step 3> })`. Use
your label exactly as it is, with no suffix such as "(handoff)". The successor replaces
you, and once you're archived it is the only card for this work, so it should look like
the card it took over from. Without this, the card's title is derived from the intent.

If `rename_session` isn't available to you or fails (a session launched before it was
added won't have it on its allow-list), carry on. The successor's instructions include
renaming itself.

### 8. Stop

End your turn. Don't archive yourself (you can't), don't message your dependents (the
successor does that once it is healthy), and don't wait for a reply.

## The successor's intent

Fill in the angle-bracket parts. Keep the summary condensed, at most a dozen lines,
because the file holds the detail.

```text
You are taking over from Agent Wrangler session <predecessor full id> ("<predecessor label>"), which has handed its work off to you and stopped.

Why: <one-sentence reason>.

FIRST read your handoff file — it is your source of truth: <absolute path to handoff file>

Condensed fallback summary, in case the file is unreadable: <what is done, what is next, branch/uncommitted state, in a few lines>.

Before resuming the work itself, do these steps in order:
1. Read the handoff file above in full.
2. If you are an orchestrator or tracked worker of a workflow, stop and tell the human; this handoff is not supported for workflow sessions.
3. Re-attach the predecessor's session links to yourself: call get_links({scope: "session"}) to see what you already have, then set_links({scope: "session", links: [...]}) with the union of those and the links listed in the handoff file (type, key, url only). Task-scoped links need nothing.
4. Call list_sessions() and confirm the dependents listed in the handoff file: sessions whose parentSession or spawnedBy is <predecessor full id>, plus the predecessor's own parent and spawner if the file names them. Exclude yourself: your own spawnedBy is the predecessor, which does not make you a dependent.
5. send_message each dependent once, in one of two forms:
   - Downward (the predecessor's nested children and the sessions it spawned): say plainly that you have replaced <predecessor full id>, and that from now on it should report to you (<use your own session id from get_session_info>), not to AW_SPAWNER_SESSION_ID, which was fixed when it launched and now points at the archived predecessor.
   - Upward (the predecessor's own parent and spawner): say that you have replaced <predecessor full id>, and that anything meant for it should now go to you.
6. Only after that, call archive_session({target: "<predecessor full id>", archive_children: false}). archive_children must be false. The default (true) would also archive the predecessor's nested children, which are still working and were deliberately left where they are.
7. If your card title is not "<predecessor label>", call rename_session on your own session id with exactly that title. You replace the predecessor, so you keep its name, with no suffix.
8. If you run a different agent provider than the predecessor (<predecessor agent>), you have not inherited its agent-specific project instructions. Treat the conventions restated in the handoff file as binding. If something binding seems missing or ambiguous, ask the human rather than guess.

Your own AW_SPAWNER_SESSION_ID is the predecessor, which you are about to archive. Anything the predecessor owed upward goes to <the session the handoff file says the predecessor reports to, or "nobody" if none>. Never send it to your env var.

Then continue the work from the handoff file's next steps.
```

## Why it is shaped this way

- **The predecessor does as little as possible.** It may be the thing that's broken, so
  its sequence has no branches or retries, and no call that depends on the successor
  being up. Everything that needs a healthy session happens on the successor's side.
- **Notify, then archive.** A dependent told "report to X" before the predecessor is
  archived never has a window where its reports go nowhere. The reverse order leaves one.
- **The successor's own spawner id is stale on arrival.** It was launched by the
  predecessor, so its `AW_SPAWNER_SESSION_ID` names a session it archives a few steps
  later. That is why the handoff file records who the predecessor reports to, and why the
  intent names that session explicitly.
- **No reparenting.** Nested children stay nested under the archived predecessor. This
  skill deliberately doesn't call `attach_session` or `detach_session`: they aren't on an
  unattended session's launch allow-list, and the mailbox redirect in step 5 is what
  actually matters to a running child. Hence `archive_children: false`.
- **A file, not a long intent.** The file can be as long as the state demands and read
  in full. The intent stays short enough to be a sane launch prompt, with a condensed
  fallback in case the path can't be read.
