# Clean-room rules

later.dog started as a fork of OpenMausBot (Apache-2.0). This repository rebuilds later.dog without any of OpenMausBot's code, so that later.dog is entirely its own work.

## Two sides

- **Spec side**: sessions allowed to read the current later.dog code. Here they add files under `spec/` and `cleanroom/`, and set up the repository. They never write product code in this repository.
- **Build side**: everyone who writes product code here. They work only from this repository, the public documentation of the tools and services later.dog uses, and published third-party packages.

## Rules for the build side

Never open, clone, fetch, search, download or install any of these, by any means (browser, git, gh, curl, package managers, search results, caches):

- `github.com/woodbeary/later-dog`, `github.com/woodbeary/later-dog-openmaus`, `github.com/woodbeary/later-dog-phone`, or any fork or mirror of them. This repository, `later-dog-clean`, is the only later.dog repository you use.
- `github.com/milind-soni/OpenMausBot`, or any fork or mirror of it.
- `openmausbot.com` and its subdomains, and downloads of the later.dog app.
- npm packages named `openmausbot` or `@openmausbot/...`.

If a task seems to need one of them, stop and put the question in your report. If you realise you have already seen content from one of them, say so in your report.

Build only from `spec/`. When the spec is unclear or silent, don't fill the gap from memory of how another product does it. Put the question in your report and choose the simplest behaviour that meets the spec.

## The checks

- `cleanroom/check/reference.fp` holds hashes of every 30-token run in OpenMausBot's code, docs and strings. It contains hashes only, no code. CI fails when a file here repeats a run of 100 tokens or more, or 80 words of prose. Run it yourself with `node cleanroom/check/fingerprint.mjs scan cleanroom/check/reference.fp . --fail`.
- `node cleanroom/check/addresses.mjs` fails when a file points at one of the sources above.

## The record

- `cleanroom/record/jobs.md` lists every job: its side, the spec files its brief came from, and the result of searching its tool log for the sources above.
- Spec files land only through the gate: the copy detector, a check for code and internal names, and a separate review.
- Detector reports are kept at each milestone.
