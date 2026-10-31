# Level builder

This folder is the design for the level builder in the administrators' console (`/console/`). It is for people editing streets by eye and for AI agents building new zones through a CLI and an API. Every phase (P0 to P6) and the P7 follow-ups are built; section 14.1 of the spec says what was built and where it differs. An agent starts with `node tools/builder/cli.mjs guide` and plays a draft with `node tools/builder/playtest.mjs --draft <id>` (spec 6.8).

- [spec.md](spec.md): the design. It covers goals, prior art (Tiny Speck's LocoDeco), the draft format, storage, the editor, the validator, the agent interface, asset intake and style, licences, publishing, limits, security, phases and open questions.
- [zone.schema.json](zone.schema.json): the JSON Schema (2020-12) for a draft zone. Its `$defs/street` fits every shipped street in `public/assets/streets/` (1,460 of 1,460 on 2026-10-30), and `$defs/draftStreet` adds the rules for streets the builder makes.
