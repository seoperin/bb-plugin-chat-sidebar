# Chat Sidebar for bb

Replaces bb's sidebar thread list with a messenger-style chat list. Each task
gets one row with its live status. The list has folders for what needs you,
tabs for projects and sections, and search. Clicking a row opens bb's own
thread view.

See [PLUGIN_OVERVIEW.md](PLUGIN_OVERVIEW.md) for the feature list.

## Install

```sh
bb plugin install git:https://github.com/<owner>/bb-plugin-chat-sidebar.git@^0.1.0
```

bb activates the first installed thread-list plugin. If you already picked
another list, choose **Chats** under Settings → Appearance → Sidebar. Pick bb's
list there to switch back.

## Settings

bb shows these on the plugin's page. Agents and scripts can change them too:

```sh
bb plugin config chat-sidebar                          # show all
bb plugin config chat-sidebar set projects "List headers"
bb plugin config chat-sidebar set density Compact
bb plugin config chat-sidebar set language Русский
bb plugin config chat-sidebar unset language           # back to Auto
```

| Key | Values | Default |
| --- | --- | --- |
| `language` | `Auto`, `English`, `Русский` | `Auto` (browser language, else English) |
| `projects` | `Folder tabs`, `List headers`, `Off` | `Folder tabs` |
| `density` | `Comfortable`, `Compact` | `Comfortable` |
| `sectionFolders` | boolean: a tab per bb section | `true` |
| `archiveFolder` | boolean: the Archive tab | `true` |
| `foldChildren` | boolean: sub-agents and forks share the parent's row | `true` |
| `hideQuietAfterDays` | days, `0` = never | `0` |

The browser remembers the selected tab and collapsed project headings
(localStorage). Nothing else is stored, and nothing is sent anywhere.

## How it works

- `app.tsx` registers `app.slots.experimental_threadList`. bb keeps the
  New-thread button, plugin rows, and footer. The plugin owns only the
  scrolling list.
- `lib/model.ts` folds child threads into roots and handles messenger order,
  folders, project groups, search, and pin-reorder neighbours. All of it is
  pure and unit-tested.
- `lib/status.ts` maps bb's `indicator`, `status`, `runtimeStatus`, and
  `activity` to three lanes (needs you, working, done) and a detailed status
  message. Unknown kinds read as quiet.
- `lib/i18n/` is a small typed translator. `en.ts` is the source of truth.
  Every other catalog must implement the same keys, and a test checks that
  placeholders match. Plural forms go through `Intl.PluralRules`.
- `components/chat-row.tsx` puts `href`, `data-sidebar-thread-shortcut-target`,
  and `data-sidebar-thread-id` on each row's anchor, and spreads bb's
  split-drag handler. That keeps the jump shortcuts, ⌘-click, and drag-to-split
  working as they do on bb's own row.
- `components/use-pin-reorder.ts` reorders pins with pointer events, not HTML
  drag and drop. bb's split drag listens to the same pointer stream and takes
  over once the pointer leaves the sidebar.
- `server.ts` only declares the settings.

Manifest strings and setting labels are in English because bb renders them
as written. Everything inside the list is translated.

## Add a language

1. Copy `lib/i18n/ru.ts` to `lib/i18n/<code>.ts` and translate the values.
   Keep the `{placeholders}`.
2. Register it in `CATALOGS` in `lib/i18n/index.ts`.
3. Add its option to `LANGUAGE_OPTIONS` and to the map in `parseSettings`
   (`lib/settings.ts`).
4. Run `npm test`.

## Development

```sh
npm install
npm run check          # typecheck, tests, bb plugin build
bb plugin install .
bb plugin reload chat-sidebar
```

`bb plugin types` syncs the SDK version with the running bb.

## License

MIT. Bundled third-party code is listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
