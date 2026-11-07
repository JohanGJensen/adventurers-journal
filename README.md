# Adventurers Journal

A desktop character sheet and campaign tool for Dungeons & Dragons 5th Edition.

Adventurers Journal is an [Electron](https://www.electronjs.org/) app with a React UI. It keeps all your data in a local SQLite database. The API runs inside the app and talks to the UI over a private `app://` protocol, so the app doesn't open a network port. It only goes online to look up rules content (spells, class levels, features) from the [D&D 5e SRD API](https://www.dnd5eapi.co/), and it caches the results locally.

## Features

- **Character sheet**: ability scores, saving throws and skills, combat stats, features and traits, equipment and inventory.
- **Spells**: spell list, plus an SRD spell browser and picker.
- **Dice tray**: roll dice right from the sheet.
- **Level-up wizard**: levels 1 → 20, asking only for the choices each level grants.
- **Homebrew**: a library and editor for your own subclasses.
- **Characters and campaigns**: keep several characters and campaigns, with campaign notes and a history log.
- **Import and backup**: import a character from a JSON sheet, and back up the whole database to a file.

## Installation

There are no prebuilt releases yet. You build the installer from source.

### Prerequisites

- [Git](https://git-scm.com/)
- [Bun](https://bun.sh/) 1.4 or newer

```sh
git clone https://github.com/JohanGJensen/dnd-tool.git
cd dnd-tool
bun install
```

### Linux

```sh
bun run dist            # checks, builds and packages release/adventurers-journal-<version>.AppImage (and an .rpm, if possible)
bun run install:linux   # installs the AppImage for the current user
```

`install:linux` copies the AppImage to `~/Applications` and adds a desktop entry and icons under `~/.local/share`, so the app appears in your app grid with its icon. It doesn't need root. If the icon doesn't show up right away, log out and back in.

To uninstall (this keeps your data):

```sh
bun run install:linux --uninstall
```

**RPM (Fedora and similar):** `bun run dist` also builds an `.rpm` when `rpmbuild` and `libcrypt.so.1` are available:

```sh
sudo dnf install rpm-build libxcrypt-compat
bun run dist
sudo dnf install ./release/adventurers-journal-*.rpm
```

### macOS

Run this on a Mac (electron-builder can only make a `.dmg` on macOS):

```sh
bun run dist   # builds release/adventurers-journal-<version>-<arch>.dmg for arm64 and x64
```

The app is unsigned. The first time you launch it, right-click it and choose **Open**, or clear the quarantine flag:

```sh
xattr -dr com.apple.quarantine "/Applications/Adventurers Journal.app"
```

### Windows

Windows builds aren't packaged yet. You can still run the app from source with `bun run start`.

## Your data

The app stores its database (`dnd.sqlite`) in its data folder:

| OS    | Location                                              |
| ----- | ----------------------------------------------------- |
| Linux | `~/.config/adventurers-journal/`                      |
| macOS | `~/Library/Application Support/adventurers-journal/`  |

Everything is in the **File** menu:

- **Import Character…** (`Ctrl/Cmd+O`) loads a character from a JSON sheet. There's an example in `test-characters/test-druid.json`.
- **Back Up Database…** (`Ctrl/Cmd+Shift+S`) saves a copy of the database, into `backups/` in the data folder by default.
- **Show Data Folder** opens the data folder.

Environment variables:

- `DND_DB`: use a database at a different path.
- `DND_IMPORT_FROM`: on first launch, start from a copy of an existing database.

If you used the app before it was renamed (as `dnd-tool`), it copies your old data over on the first launch.

## Development

```sh
bun run dev
```

This starts Vite (with hot reload for the UI), rebuilds the Electron main process whenever you save, and restarts Electron when that code changes. Closing the window or pressing `Ctrl+C` stops everything.

| Script                  | What it does                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| `bun run dev`           | Dev mode: Vite HMR, plus Electron that restarts on changes            |
| `bun run start`         | Build and run the app                                                 |
| `bun run build`         | Build the UI and the Electron main process                            |
| `bun test`              | Run the unit tests                                                    |
| `bun run check`         | Type-check, run the tests, and smoke-test the server on Electron's Node |
| `bun run dist`          | Check, build and package the app for this platform (Linux or macOS)   |
| `bun run install:linux` | Install the packaged AppImage for the current user                    |

Two standalone scripts aren't wired into `package.json`, because you rarely need them:

- `bun scripts/gen-textures.ts` regenerates the parchment and leather textures in `public/textures/`.
- `bun scripts/check-levels.ts [class]` compares the class tables in `src/lib/rules.ts` with the SRD API (needs network).

### Project structure

```
src/        React UI (components, hooks, character rules)
server/     API, SQLite database layer, migrations, SRD proxy and cache
electron/   Electron main process, app menu, app:// protocol
scripts/    Dev, build, packaging and install scripts
build/      App icons used for packaging
public/     Static assets for the UI
```

## Credits

Rules content comes from the [D&D 5e SRD API](https://www.dnd5eapi.co/), which serves the System Reference Document published by Wizards of the Coast under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/). Adventurers Journal is unofficial fan content and is not affiliated with or endorsed by Wizards of the Coast.
