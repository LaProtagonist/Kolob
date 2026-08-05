# Project agent rules

## Onboarding

At the beginning of every new Codex chat, the first project command is:

```bash
npm run project:onboard
```

If onboarding reports a stale handoff, registry drift, timeline failure, or a missing required tag, stop content work and repair governance through a new append-only event. On a new computer, run `git fetch --all --tags` before onboarding.

## Git ownership

The project owner manages Git decisions. Do not stage, unstage, commit, push, pull, merge, rebase, stash, switch or create branches, reset, restore, or revert unless the owner explicitly requests that exact operation in the current task. Read-only Git commands are allowed.

For explicitly authorized governed iterations:

- one iteration must not mix unrelated edits;
- a content commit must contain all mandatory governance trailers;
- an iteration is complete only after `npm run iteration:seal` creates its append-only committed event, annotated iteration tag, generated context, and separate seal commit;
- push is never automatic, and iteration tags must be pushed together with their commits when the owner later authorizes a push;
- force-push and rebase are forbidden for sealed history;
- tags are never replaced with force;
- Git notes are not a canonical or sole link;
- old events and receipts are never edited; corrections are new append-only events;
- no content rollback uses `git reset`: latest reversals use suffix-only governed rollback, and historical reversals use a compensating change.

After editing files, leave changes unstaged unless the current task explicitly authorizes the exact content/seal commits. Report changed files and final status.

