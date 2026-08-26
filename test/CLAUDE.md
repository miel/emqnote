# Tests that wait on real filesystem timing

Two files in this directory wait on the real filesystem rather than a mock, and both have
failed a release by getting the wait wrong. This file carries what each one learned. It used
to sit in the root `CLAUDE.md`, where it was in context on every turn of every session; it
loads here when you are actually working under `test/`.

The rule both of them arrive at, stated once: **wait for the result of an operation, never
for a duration.** The exceptions are named where they occur, and each one is a case where
what is being waited for is the *absence* of a result, which has nothing to wait on.

`test/index-watch.test.ts` is the one deliberate exception: it runs `chokidar` against a real temp directory rather than mocking the filesystem, so real events need real wall-clock waiting. It uses a much smaller `stabilityThreshold` than the 300 ms production default (see `index-watch.ts`) and the smallest settle margin found to be reliable across repeated runs, not an arbitrary one — still worth noticing if the suite's total time starts to matter.

**Everything in that file starts its watcher through `startWatching`, and the reason is a
backend property rather than a slow runner.** chokidar's `ready()` resolves when its initial
crawl has finished, which is not the moment the watcher is actually armed: a file written
into that gap produces **no event at all**, and an event that was never sent cannot be
waited out — which is why raising the timeouts, twice, never settled it, and why it went on
failing a release every few dozen runs. The helper pays one settle after `ready()` on every
platform but Linux, where inotify delivers from the moment the watch is added.

**That used to say "on darwin only", and the sentence that excused Windows is what cost a
third release** (v0.8.9). It reasoned that polling has no gap — only an interval — so
`watchInterval` answered it and no settle was owed. It does have a gap, and a worse one: a
poller finds a new file by re-reading a directory and diffing against the entries it already
knows, so a file that lands before that baseline is taken is *in* the baseline and is never
called new at all. Permanently missed, not noticed a poll later, which is why the failure
reads as total silence and why no ceiling could have helped. Measured by forcing
`pollingOptions` on off-Windows and running the failing sequence 40 times per delay: **23 of
40 missed with no wait, 0 of 40 at 25 ms and at every longer wait, 0 of 100 at the settle
now paid** — against native watching missing 0 of 40 with no wait at all. The general lesson
is the one this file keeps relearning: a platform excused from a wait because of how its
backend is *described* is a platform whose behaviour nobody measured. `index-watch.ts`'s
`ready()` carries what this means for the app, which is not nothing — on Windows the startup
full scan is the only thing that will see a file OneDrive lands in those first moments.

The poll interval is `WatchOptions.watchInterval`, turned down in the tests exactly as
`stabilityThreshold` already is: at the production two seconds every waiting assertion in
that file waits out a poll, which put it at 23 seconds on the Windows runner.

**And that file's `waitFor` ceiling is deliberately generous rather than tight.** It was
four seconds, picked to fit under vitest's five-second default, and that is the wrong way
round — this is real filesystem timing on a shared CI machine, and it failed two releases
in a row while *the same tests on the same commit* passed in the `build` workflow minutes
earlier. `waitFor` returns the moment its condition holds, so a high ceiling costs nothing
on the happy path and is only ever reached by a genuine breakage or a runner having a bad
minute; the per-test timeout is raised above it (`vi.setConfig`) so a timeout still reports
the assertion that failed rather than a bare "test timed out". A wrong red is worse than a
slow red — especially in the file whose whole job is watching a filesystem. The two tests there that
assert something is *not* indexed go through it too: a missed event makes those pass for the
wrong reason, which is worse than failing.

**And it was not the only file waiting on a number.** `capture-writer.test.ts` failed the
`v0.10.0` release on Windows while the same tests on the same commit had passed in `build`
twenty minutes earlier — the identical shape, one file over. `vi.advanceTimersByTimeAsync`
fakes the *timer* and nothing else, so the disk I/O the debounce callback starts is real,
and a flat `sleep(20)` after it was the whole margin. **The failure was a write racing
itself, not a slow assertion**: `writeAtomic` goes to `<path>.tmp` and then renames, so a
second `update` provoked while the first was still in flight renamed a temporary file the
first had already consumed — `ENOENT … rename '….md.tmp'`, arriving as an unhandled
rejection attributed to whichever test was running by then, which is why the reported test
and the broken one were two different tests. The rule is the one above: **wait for the
result of a write before provoking the next one**, never for a duration. Only that one test
needed it — every other test in the file already goes through `await writer.flush()`, which
awaits the write itself. `capture-store.test.ts`'s own `sleep(20)` is a different thing and
is fine: a deliberate gap between two *awaited* writes so an mtime change would be visible.
