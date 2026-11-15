# Chat Sidebar

- This is a public BB Community marketplace plugin used by other people. Use
  general rules and supported SDK APIs; never tailor behavior to one account,
  project, task key, thread title or local path.
- Regression tests must use synthetic, anonymous fixtures. Do not commit real
  thread IDs, messages, names, account data or snapshots. Authorized checks on
  real threads stay outside the repository, in private thread storage.
- Deliver narrowly scoped, complete changes as patch releases. Update the
  manifest, lockfile and changelog; run type checks, tests and the plugin build,
  then publish an immutable `vX.Y.Z` tag and verify GitHub CI. Keep marketplace
  compatibility ranges accurate. Never move an existing release tag.
- The marketplace tracks `^0.2.0` tags. BB discovers compatible updates through
  that range; discovery does not mean every user has installed the update.
