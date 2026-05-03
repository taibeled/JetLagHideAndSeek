# Orchestrator Agent Tips

## Parallel exploration first
Spin up 4-5 read-only exploration agents simultaneously to map the codebase.
One round-trip covers all source files, exports, types, and existing test patterns.
Never explore sequentially when parallel reads work.

## Shrink implementer prompts
Don't paste full source files. Give implementers key function signatures, type
shapes, and 2-3 lines of existing test convention. Trust them to read source if
they need more context. Long prompts are single points of failure.

## Red/green review pairs are worth it
A separate reviewer agent catches bugs the implementer misses — false positives,
wrong field names, incomplete cleanup. The overhead of a second agent pays for
itself in skip-cycles on review.

## Make review prompts surgical
Don't ask "review everything." Give reviewers a checklist of known gotchas:
- Are atoms reset in afterEach?
- Do mocked modules cross-contaminate across tests?
- Are crypto/fetch stubs unstubbed?
- Do test fixtures match actual schema fields?

## Verify on disk after every round
Don't trust agent self-reports of "all tests pass." Run `pnpm test` yourself.
Agents can't see each other's files and may silently overwrite or miss writes.

## Split large phases by domain
Server tests (Fastify inject, Node imports, .js extensions) and frontend tests
(Vitest + Nanostores, browser globals, @/ imports) have different conventions.
Split them into separate agents even if they're in the same plan phase.

## Use the agent log
Have subagents append notes to `agent_log.md`. Even one-line entries like
"mocked @/lib/cas with vi.mock; used vi.hoisted for probeHealth" save the next
agent from re-solving the same problem. See agent_log.md for the format.
