# Changelog

## 0.1.2

- Checked against bb 0.45 and built with its plugin SDK (0.6.15). bb no
  longer reports the "machine reconnecting" thread status, so the list drops
  it too. Still works with bb 0.44.

## 0.1.1

- Project colours no longer fall back to automatic ones when bb mounts the
  list again or the backend answers late. The last colours seen are shown
  straight away, a failed load is retried, and colours are reloaded after the
  realtime connection comes back.

## 0.1.0

First release.

- A messenger-style replacement for bb's sidebar thread list. Each task gets
  one row, sub-agents and forks fold into their parent, and the row shows live
  status, drafts, and other plugins' row statuses.
- Folders: All, Attention, projects, sections, and Archive, shown as tabs or
  as a rail on the left.
- Project colours, assigned automatically or picked per project and synced
  across devices.
- Context-aware **+** for a new chat, search, pinned-chat reordering,
  back-to-top, and paging for long lists.
- English and Russian.
