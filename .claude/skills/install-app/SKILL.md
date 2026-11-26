---
name: install-app
description: Install the latest merged Adventurers Journal on this machine. Checks out master, pulls, builds the installer, installs it (macOS /Applications, or the Linux AppImage), and removes stray app copies so Spotlight shows only the installed one. Use after a feature PR is merged, or when asked to "checkout, build, install", "install the app", "update the installed app", "clean up the app in Spotlight", or for "/install-app [branch]".
---

# Install the app

The usual end of a feature: the PR is merged, and the installed app should become the new master.
Run the steps in order and stop at the first failure. Report what failed and its output, and don't
work around it.

`[branch]` (optional) builds that branch instead of master. Say clearly that it isn't master.

## 1. Check out and pull

```sh
git status --short
```

If there are uncommitted changes, **stop and ask** what to do with them. Don't stash, reset or discard
them yourself. Otherwise:

```sh
git checkout master && git pull --ff-only
git log --oneline -1   # report this commit
```

If the feature branch you just merged is still checked out locally, mention it. Delete it only if the
user asks.

## 2. Build

```sh
bun install
bun run dist   # runs `bun run check` first (tsc, tests, Electron smoke), then packages into release/
```

This takes a few minutes, so use a long timeout (10 min). electron-builder lists the Mac's signing
identities, including corporate certificates. That's noise: the app is unsigned. If `check` fails,
stop: don't install a build that failed its tests.

## 3. Install

- **macOS:** `bun run install:mac`. It quits the running app, installs the `.dmg` for this Mac's
  architecture into `/Applications` (replacing the old copy), clears the quarantine flag, and deletes
  the unpacked `release/mac*/` app bundles.
- **Linux:** `bun run install:linux`.

## 4. Check the cleanup (macOS)

Only the copy in `/Applications` should be an indexed app bundle:

```sh
mdfind "kMDItemContentType == 'com.apple.application-bundle' && kMDItemFSName == '*dventurer*'c"
ls /Volumes   # no leftover "adventurers-journal …" image mounted
```

If another copy shows up outside `/Applications` (an old download, a copy in the Trash, a mounted
image), show the user the paths and ask before deleting any of them. Don't touch the user's data in
`~/Library/Application Support/adventurers-journal/`.

## 5. Report

A few lines: the commit installed, the version and architecture, where it went, what was cleaned up,
and that the data folder wasn't touched. Don't launch the app unless asked. Say that you haven't opened
it. A new migration runs against the real journal the first time the app starts, so mention any
migration that came with the merged work.
