# later.dog agent notes

Read `CLEANROOM.md` first. Its rules come before everything else here.

- Build only from `spec/`. Name the spec IDs each change implements in its PR and in its test names.
- Always use pnpm, never npm. Node 24 or newer.
- No comments in code. Say it with names, types and tests. The only exceptions are lines that tools read (lint and test directives, shebangs) and licence notices that adapted third-party code came with.
- Every behaviour lands with tests that run it.
- Third-party packages must be published under MIT, Apache-2.0, BSD, ISC or a similar licence. Record any code you adapt in `NOTICE` with its licence.
- Before you finish, run the tests and `node cleanroom/check/fingerprint.mjs scan cleanroom/check/reference.fp . --fail` and `node cleanroom/check/addresses.mjs`.
