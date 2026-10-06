# Changelog

## 0.2.1

- **Icons-only rail.** A new setting, **Folder names on the rail**, turns off
  the names under the rail's icons. The rail gets narrower, and a folder's
  name still shows on hover. It is on by default, so nothing changes until
  you turn it off.

## 0.2.0

- **Your own folders**, like Telegram's. Pick chats by status, project,
  section, agent, words in the title or branch, how long they have waited, or
  when they were last active, and add or leave out chats by hand. Ready-made
  folders to start from: waiting over an hour, failed today, working now,
  unread, pinned.
- **Arrange every folder** in a new editor: hide, rename, reorder, and give
  each an icon (over 130 to choose from) and a colour. It opens from
  **Folders** at the foot of the rail, the sliders at the end of the tabs, or
  a folder's menu, and is a bottom sheet on phones.
- **Drag to reorder like bb's own sidebar**: neighbours make room as you
  drag, folders move in the rail, the tabs and the editor, a folder per
  project moves as one block, and the keyboard works too (Space, then the
  arrows). On a touch screen, hold a folder or a pinned chat to pick it up;
  letting go without moving opens its menu. Pinned chats can now be dragged
  on a touch screen as well.
- **Add to folder** in a chat's menu, and **New chat in …** in the menu of a
  folder about one project.
- **Safe folders.** They sync across your devices, and a device that was
  offline cannot undo newer changes. The last 20 versions are kept and can be
  restored. Deleting a folder, resetting and restoring ask first, and
  deleting and resetting can be undone from the notification.
- **Colours.** Three more to pick: yellow, brown and slate. Violet and
  magenta are easier to tell from their neighbours. A folder about one
  project wears that project's colour.
- Nothing changes until you arrange the folders: they are built from the
  existing settings, which now stay in step with the editor.

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
