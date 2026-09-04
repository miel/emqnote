# emqnote roadmap

This roadmap starts at **v0.12.12**. It describes what is required for a trustworthy
v1.0 release, three alternative directions for v2.0, and possible directions after
v2.0. It is not a promise that every item below will be built.

The v2.0 scenarios are mutually exclusive product strategies. All three assume the same
primary user: a solo knowledge professional working across meetings, notes, and tasks.
Choosing one scenario means prioritising that scenario's purpose rather than combining
all three into one release.

Lead-time estimates assume one developer who already knows the codebase. They are
directional and exclude delays for certificates, app-store review, corporate approvals,
and changes to Microsoft 365 or OneDrive policy.

## Current baseline: v0.12.12

emqnote is already a capable local-first desktop application for Windows and macOS. Its
core is in place:

- resident, low-latency capture through a global shortcut;
- WYSIWYG editing backed by ordinary Markdown files;
- rich outlines, tables, inline tasks, links, images, PDFs, and other attachments;
- a library with folders, full-text search, filters, pinned notes, and an aggregated
  Tasks view;
- Obsidian-compatible wiki links and automatic link repair after moves and renames;
- OneDrive-aware file watching, atomic writes, conflict detection, and recoverable trash;
- a Windows installer and updater, and packaged macOS builds.

The remaining distance to v1.0 is therefore mainly release readiness, validation, and
critical usability work. It is not a reason to add another large feature set.

## v1.0: the minimum trustworthy public release

### Public distribution

- Add an explicit software licence and complete the public project metadata.
- Replace the builder-oriented README with installation, first-run, vault selection,
  Files On-Demand, upgrade, and recovery guidance.
- Explain what can contact the network: update checks and remote images included in pasted
  content. Note explicitly that notes themselves remain in the user's chosen vault.
- Document the unsigned Windows SmartScreen and macOS Gatekeeper paths. Code signing and
  notarisation are welcome, but documentation is the minimum v1.0 requirement.
- Verify a real Windows installation updating to a newer release through the complete
  confirmation, download, restart, and recovery flow.

### Critical usability and accessibility

- Protect the reader when the library window narrows: reclaim space from navigation panes
  before allowing the note itself to become unusably narrow.
- Give Tasks distinct loading, empty, failed, and retry states.
- Make accidental task completion easy to undo without first changing filters, and enlarge
  the interactive checkbox target without enlarging its visual mark.
- Give the metadata fields and editor accessible names; add proper dialog, autocomplete,
  listbox, and splitter semantics.
- Make pane resizing keyboard-reachable, improve small-text and control-boundary contrast,
  and validate the principal workflows with NVDA and VoiceOver.

Other visual refinements, new task-planning concepts, and broad navigation redesigns do
not block v1.0 unless testing shows that they prevent an existing workflow.

### Compatibility and reliability

- Capture a live paste from classic Outlook on Windows. If it supplies proper HTML lists,
  record that the existing parser is sufficient. If it supplies flat `MsoListParagraph`
  content, implement only the reconstruction needed to preserve that paste correctly.
- Verify a dirty note during folder rename, switching vaults without touching the previous
  vault, and the edit lock between the capture and library windows.
- Open a representative vault in Obsidian and confirm notes, nested lists, links, images,
  and attachments remain usable outside emqnote.
- Verify that an edit arriving through OneDrive appears on the other machine within the
  documented target after synchronization completes.
- Complete a one-week, two-machine soak without an unexplained conflict copy or lost edit.

### Measured release gates

- Measure search at 5,000 notes against the 30 ms target and opening a note against the
  50 ms target.
- Record a repeatable Windows hotkey-to-caret latency series, including machine and display
  details.
- Measure the resident process's steady-state memory use on the work machine.
- Walk the cross-platform manual release protocol, including shortcuts, dark mode,
  external changes, attachments, and update behaviour.

### Explicitly deferred from v1.0

Email-in, templates, export, structured task metadata, a web clipper, web access, and mobile
clients are not required for v1.0. Keeping them out protects the release from unrelated
architecture and product decisions.

**Expected lead time:** **4–6 calendar weeks**, including the required one-week soak and
physical Windows and macOS verification.

The detailed release gate remains in
[`TODO-BEFORE-RELEASE.md`](TODO-BEFORE-RELEASE.md), with manual checks in
[`TEST-PROTOCOL.md`](TEST-PROTOCOL.md).

## v2.0: three alternative scenarios

| Scenario | Primary outcome | Current-system impact | Complexity | Expected lead time |
|---|---|---|---|---|
| **A. Focused meeting companion** | Faster meeting notes, inline follow-up, and retrieval without context switching | Low format impact; moderate index and UI growth | Medium | 8–12 weeks |
| **B. Integrated task manager** | Notes and a full personal/delegated task-planning system in one application | Major task-format, index, query, and UI changes | High | 4–6 months |
| **C. Multi-channel knowledge hub** | Capture and retrieve knowledge through desktop, email, web, and mobile surfaces | New clients, authentication, services, and sync boundaries | Very high | 9–15 months |

### Scenario A: the focused meeting companion

#### Product intent

Keep emqnote a quick note-taking application first. Tasks remain inline parts of meeting
notes, but following them up should not require switching to a separate task application.
The application should become faster to enter, more flexible while editing, and easier to
retrieve from without becoming a general productivity suite.

#### Most important additions

- **User-managed templates.** Activate the existing `_templates/` convention for recurring
  forms such as meetings, one-to-ones, calls, and decisions, without forcing a template
  choice on ordinary quick capture.
- **Meeting follow-up.** Improve the path from an aggregated task back to its exact context,
  retain useful note context while working through tasks, and support a lightweight review
  of open tasks from recently modified notes.
- **Flexible task triage.** Group and sort existing inline tasks by note, folder, modified
  date, and completion state. Do not add due dates, priority, or a separate task database in
  this scenario.
- **Better retrieval.** Add saved searches, recent and weekly-review views, reusable filter
  combinations, and lightweight incoming-link or related-note discovery without a graph
  view.
- **Faster editing.** Refine keyboard navigation, capture defaults, metadata entry, and
  common insert operations based on observed meeting workflows.
- **Calmer library UI.** Stabilise note-row layout, keep permanent destinations reachable,
  make tags' click behaviour unambiguous, and provide a deliberate narrow-window mode.
- **Practical export.** Export a note or folder to a shareable PDF or DOCX while keeping
  Markdown as the source of truth.

#### Impact on current functionality

- **Latency:** low risk if templates, reviews, and related-note queries load after the
  capture window is ready. Hotkey capture must not enumerate the vault or wait for SQLite.
- **UI/UX complexity:** moderate. New retrieval and review functions must fit the existing
  library without turning its sidebar into a catalogue of modes.
- **Compatibility:** low risk. Tasks remain standard Markdown checkboxes and templates are
  ordinary files. Export is one-way and does not alter vault content.
- **Functional dependencies:** existing Markdown pipeline, SQLite index, filters, wiki-link
  resolver, `_templates/` folder, and platform export libraries.

#### Delivery assessment

This is mostly an extension of proven architecture. The largest product risk is adding too
many retrieval controls to an application valued for having few choices.

**Development complexity:** medium.  
**Expected lead time:** **8–12 weeks**.

### Scenario B: the integrated task manager

#### Product intent

Make emqnote the user's complete task manager as well as the place where tasks originate.
A task stays connected to the note and meeting that created it, while gaining enough
structure for daily planning, delegation, and project follow-up.

#### Most important additions

- **Stable task identities.** Give each task a durable identity that survives edits,
  reordering, moves, and index rebuilds; the current note-path plus ordinal address is not
  sufficient for long-lived task metadata.
- **Structured metadata.** Support at least start date, due date, completion date, priority,
  responsible person, and project. Define a documented, readable Markdown representation
  and migration rules before building the UI.
- **Planning views.** Add Today, Upcoming, Overdue, Waiting/Delegated, Completed, and project
  views, with grouping, sorting, and saved filters.
- **Task editing.** Provide quick metadata editing beside the note, a focused task-detail
  view when needed, and safe bulk changes from aggregated views.
- **Reminders and review.** Add platform notifications and daily/weekly planning workflows.
  Consider recurrence only after the core model and migration have proven stable.
- **Reliable cross-note updates.** Preserve atomic writes, edit locks, undo expectations,
  external-change handling, and link/task focus when a task is changed outside its note.

The responsible-person field represents delegation recorded by one user. It does not add
shared accounts, assignment notifications, permissions, or collaborative editing.

#### Impact on current functionality

- **Latency:** medium-to-high risk. More task fields enlarge scans and queries, while Today
  and reminder calculations introduce time-based refreshes. The task manager must remain
  lazy and independent of the resident capture path.
- **UI/UX complexity:** high. A small checkbox becomes a record with lifecycle and metadata.
  Progressive disclosure is required so ordinary meeting-note entry remains as quick as it
  is today.
- **Compatibility:** high impact. The task encoding must stay readable in plain Markdown and
  degrade predictably in Obsidian and other editors. Existing checkbox tasks need a safe,
  preferably on-demand migration.
- **Functional dependencies:** ProseMirror task attributes and commands, Markdown parser and
  serializer, a new SQLite schema version, stable task IDs, expanded IPC types, time-zone
  rules, notifications, and richer task queries.

#### Delivery assessment

This scenario changes the product model, not merely the Tasks screen. The task format and
stable identity design are feasibility gates: implementation should not begin until both
round-trip safely and remain understandable outside emqnote.

**Development complexity:** high.  
**Expected lead time:** **4–6 months**.

### Scenario C: the multi-channel knowledge hub

#### Product intent

Turn emqnote into a local-first knowledge system that accepts information wherever work
happens. Desktop capture remains the fastest path, but email, browsers, mobile devices,
and a web interface become supported entry and retrieval points.

#### Most important additions

- **A shared core.** Extract portable Markdown, filename, note-construction, validation,
  and ingestion contracts so every client writes the same vault dialect.
- **Email-in.** Process `.eml` messages and attachments through the existing `_incoming/`
  concept, preserve provenance, and provide retry and quarantine states for malformed input.
- **Web clipper.** Ship browser extensions that capture a selection or page with source URL,
  title, readable content, and downloaded attachments.
- **Mobile application.** Support capture, reading, search, and Inbox processing, with a
  durable offline outbox and an explicit OneDrive File Provider or Microsoft Graph access
  strategy.
- **Web interface.** Provide authenticated capture and retrieval when the desktop and mobile
  applications are unavailable.
- **Unified ingestion.** Add source metadata, duplicate detection, immutable intake records,
  visible processing state, idempotent retries, and repair tools across all channels.
- **Cross-client conflict handling.** Define how simultaneous edits, background delivery,
  indexing, and schema-version compatibility work across desktop, browser, web, and mobile.

#### Impact on current functionality

- **Latency:** the desktop hotkey, editor, and local search must never wait for authentication,
  a server, or remote ingestion. Network work belongs in asynchronous queues and workers.
- **UI/UX complexity:** high. Each surface needs a deliberately limited role and consistent
  delivery status; reproducing the complete desktop interface everywhere would create four
  difficult applications instead of one coherent system.
- **Compatibility:** medium-to-high risk. A shared dialect helps, but more writers increase
  collision and conflict frequency. Version negotiation and conservative fallback behaviour
  become necessary.
- **Architecture:** this scenario breaks the current **no server, no account, no service**
  boundary. That trade must be accepted explicitly. A web interface cannot be treated as a
  small addition to a local filesystem application.
- **Functional dependencies:** shared package boundaries, Microsoft Graph or platform file
  providers, OAuth and secret handling, a hosted API and storage strategy for web access,
  browser-extension distribution, mobile signing/distribution, ingestion security, and
  operational monitoring.

#### Delivery assessment

Begin with feasibility gates for corporate OneDrive access, authentication, and the minimum
hosted architecture. The existing iPhone capture study in
[`07-iphone-reviewed-clean.md`](07-iphone-reviewed-clean.md) is a useful starting point, but
this scenario is broader than that capture-only proposal.

**Development complexity:** very high.  
**Expected lead time:** **9–15 months**.

## Optional directions after v2.0

These are possibilities, not a backlog. Their value depends on which v2.0 scenario is
chosen and what actual use reveals.

- Privacy-preserving semantic search, summarisation, and question answering.
- Calendar and meeting-platform integration.
- Audio capture, transcription, OCR, and handwriting ingestion.
- Additional desktop and mobile platforms.
- Controlled publishing and sharing.
- Collaboration and team workspaces.
- An extension API and third-party integrations.
- Visual maps and richer exploration of relationships between notes.
- Enterprise administration, retention, audit, backup, and policy controls.

## Roadmap principles

Whatever direction is chosen, future releases should preserve the properties that make
emqnote useful today:

1. A hotkey must still reach an editable caret within the measured latency budget.
2. Opening a note must not rewrite it, and saves must remain atomic.
3. The vault must remain usable as ordinary files without emqnote.
4. New complexity should stay out of quick capture until the user asks for it.
5. Performance, compatibility, and synchronization claims must be measured on real target
   systems rather than inferred from unit tests alone.
