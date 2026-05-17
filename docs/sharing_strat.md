# Mobile v2 Deep Link Sharing Design

## 1. Purpose

This document designs a serverless multiplayer sharing system for `mobile_v2`, centered on app deep links that work for:

- Sharing initial game state with seekers or teammates.
- Asking hiders questions.
- Returning hider answers.
- Sharing teammate updates.
- Pasting links into chat apps.
- Showing and scanning QR codes.

The design intentionally starts without a central server. It should still leave room for a future snapshot server or live room server by using the same wire envelopes for every transport.

## 2. Goals

### 2.1 Product goals

- A user can configure a game and share a setup link or QR code.
- Another user can open the setup link and import the game state.
- A seeker can ask a hider a question by sending a link or showing a QR code.
- A hider can answer the question and send back an answer link or QR code.
- A seeker can import the answer and apply it to the local question list/map state.
- Teammates can share updates without accounts, rooms, or a server.

### 2.2 Engineering goals

- Keep the app local-first.
- Use one validated wire format across paste, share sheet, QR, custom-scheme links, and future HTTPS links.
- Make import safe: validate first, preview second, mutate state only after explicit user confirmation.
- Avoid coupling URL parsing directly to game-state mutation.
- Keep UI concerns separate from wire encoding, validation, and state application.

## 3. Non-goals

- No realtime multiplayer in the first version.
- No accounts or login.
- No central room state.
- No automatic background sync.
- No hider location sharing.
- No silent state mutation from opening a link.
- No attempt to solve conflicts perfectly in the first version.

## 4. Existing mobile_v2 context

`mobile_v2` is structured around a native map canvas plus an Apple Maps-style bottom drawer. The current app shell has:

- `MapAppScreen`
- `NativeMap`
- `AppBottomSheet`
- `PlayAreaProvider`
- `HidingZoneProvider`

The current `app.json` already defines a custom scheme:

```json
"scheme": "jetlag-hide-seek-v2"
```

That means custom-scheme links can be supported early:

```text
jetlag-hide-seek-v2://import?d=<payload>
```

Later, production-friendly HTTPS links can be added:

```text
https://<your-domain>/i?d=<payload>
```

The existing design notes already call out a copy/paste modal and a wire format containing:

- Play Area
- Hiding Zones
- UI
- Question state
- New Question

This design refines that into a dedicated sharing/import subsystem.

## 5. Recommended user-facing link types

### 5.1 Custom-scheme link

Used for dev builds and early app-only sharing.

```text
jetlag-hide-seek-v2://import?d=<encoded-envelope>
```

Pros:

- Works before domain setup.
- Works in local dev builds.
- Uses the existing Expo scheme.

Cons:

- Some chat apps may not auto-link it.
- No useful fallback when the app is not installed.
- Less user-friendly than HTTPS.

### 5.2 HTTPS link

Used for production chat and QR sharing.

```text
https://<your-domain>/i?d=<encoded-envelope>
```

Pros:

- Best for LINE, iMessage, Discord, Slack, email, QR codes, and browser fallback.
- Can open the app through iOS Universal Links and Android App Links.
- Can later switch from direct payloads to snapshot ids.

Cons:

- Requires a domain.
- Requires Associated Domains on iOS.
- Requires Android App Links verification.
- Requires hosting well-known verification files.

### 5.3 Future snapshot-link variant

If direct payload links become too long, use a tiny content-addressed snapshot service later:

```text
https://<your-domain>/i?s=<snapshot-id>
```

The app import flow should treat this as a transport detail. The decoded result should still be the same `WireEnvelope` type.

## 6. URL routes

### 6.1 App route

Add a single import route:

```text
mobile_v2/app/import.tsx
```

This route receives deep links and renders an import preview screen.

### 6.2 Preferred URL path

For HTTPS links:

```text
/i?d=<encoded-envelope>
```

The website can redirect or universal-link into:

```text
/import?d=<encoded-envelope>
```

### 6.3 Custom-scheme path

For custom scheme links:

```text
jetlag-hide-seek-v2://import?d=<encoded-envelope>
```

### 6.4 Why one route?

Use one route for all importable payloads. The envelope `kind` determines what UI to show.

Do not create separate public URL shapes for each feature, such as:

```text
/ask-question
/import-state
/import-answer
```

Those become harder to migrate. A single import route keeps versioning and validation centralized.

## 7. Wire envelope model

### 7.1 Envelope union

```ts
type WireEnvelope =
    | AppStateEnvelopeV1
    | QuestionRequestEnvelopeV1
    | QuestionAnswerEnvelopeV1
    | TeamEventsEnvelopeV1;

type AppStateEnvelopeV1 = {
    kind: "app-state";
    version: 1;
    payload: AppStateV1;
};

type QuestionRequestEnvelopeV1 = {
    kind: "question-request";
    version: 1;
    payload: QuestionRequestV1;
};

type QuestionAnswerEnvelopeV1 = {
    kind: "question-answer";
    version: 1;
    payload: QuestionAnswerV1;
};

type TeamEventsEnvelopeV1 = {
    kind: "team-events";
    version: 1;
    payload: GameEventV1[];
};
```

### 7.2 App state payload

```ts
type AppStateV1 = {
    gameId: string;
    playArea?: PlayAreaWireV1;
    hidingZones?: HidingZoneWireV1;
    ui?: UiSettingsWireV1;
    questions?: QuestionStateV1[];
    metadata: {
        createdAt: string;
        updatedAt: string;
        createdBy?: string;
    };
};
```

The fields are optional because the share UI may allow partial exports:

- Play area only
- Play area + hiding zones
- Questions only
- Full game setup

### 7.3 Question request payload

```ts
type QuestionRequestV1 = {
    gameId: string;
    requestId: string;
    question: QuestionDraftV1;
    askedBy?: string;
    askedAt: string;
};
```

A question request is what a seeker sends to a hider.

It should include enough information for the hider app to render the question and answer it, but it should not include private seeker-only state unless needed.

### 7.4 Question answer payload

```ts
type QuestionAnswerV1 = {
    gameId: string;
    requestId: string;
    answer: QuestionAnswerValueV1;
    appliedQuestion: QuestionStateV1;
    answeredBy?: string;
    answeredAt: string;
};
```

`appliedQuestion` is the final locked question state that the seeker can apply to elimination.

This avoids ambiguity where the hider answered a question but the seeker has a slightly different local draft.

### 7.5 Team events payload

```ts
type GameEventV1 =
    | {
          id: string;
          gameId: string;
          type: "question.requested";
          request: QuestionRequestV1;
          createdAt: string;
      }
    | {
          id: string;
          gameId: string;
          type: "question.answered";
          answer: QuestionAnswerV1;
          createdAt: string;
      }
    | {
          id: string;
          gameId: string;
          type: "app-state.imported";
          snapshotHash: string;
          createdAt: string;
      };
```

The app should keep a local set of applied event ids so repeated imports are idempotent.

## 8. Encoding format

### 8.1 Pipeline

```text
WireEnvelope object
  → Zod validate
  → canonical JSON
  → deflate/gzip
  → base64url
  → URL query param d=<payload>
```

### 8.2 Why canonical JSON?

Canonical JSON gives stable payloads and stable hashes.

Rules:

- Sort object keys recursively.
- Remove keys with `undefined` values.
- Preserve arrays in order.
- Use ISO timestamps.
- Store distances internally in meters.
- Store coordinates in GeoJSON order where possible: `[longitude, latitude]`.

### 8.3 Compression

Use `fflate`, which is already a dependency in `mobile_v2`.

Recommended functions:

```text
encodeEnvelopeToPayload(envelope)
decodePayloadToEnvelope(payload)
```

### 8.4 Base64url

Use URL-safe base64, not ordinary base64.

Replace:

```text
+ → -
/ → _
remove trailing =
```

This prevents QR/chat/link escaping problems.

## 9. Subcomponent architecture

## 9.1 `src/sharing/wire/schema.ts`

Responsibility:

- Define all Zod schemas.
- Export TypeScript inferred types.
- Validate incoming unknown payloads.

Exports:

```ts
export const wireEnvelopeSchema: z.ZodType<WireEnvelope>;
export const appStateEnvelopeSchema: z.ZodType<AppStateEnvelopeV1>;
export const questionRequestEnvelopeSchema: z.ZodType<QuestionRequestEnvelopeV1>;
export const questionAnswerEnvelopeSchema: z.ZodType<QuestionAnswerEnvelopeV1>;
export type WireEnvelope = z.infer<typeof wireEnvelopeSchema>;
```

Does not:

- Read URLs.
- Mutate app state.
- Render UI.

## 9.2 `src/sharing/wire/canonicalize.ts`

Responsibility:

- Deterministic JSON generation.
- Recursive key sorting.
- `undefined` stripping.

Exports:

```ts
export function canonicalize(value: unknown): string;
export function stableHash(value: unknown): string;
```

`stableHash` can be added later if needed for import dedupe or snapshot ids.

## 9.3 `src/sharing/wire/codec.ts`

Responsibility:

- Convert envelopes to compact payload strings.
- Convert compact payload strings back to validated envelopes.

Exports:

```ts
export function encodeEnvelope(envelope: WireEnvelope): string;
export function decodeEnvelopePayload(payload: string): WireEnvelope;
```

Implementation steps:

```text
encode:
  validate with Zod
  canonicalize
  UTF-8 encode
  deflate
  base64url encode

decode:
  base64url decode
  inflate
  UTF-8 decode
  JSON parse
  validate with Zod
```

## 9.4 `src/sharing/links/buildLink.ts`

Responsibility:

- Build shareable links from encoded payloads.
- Centralize URL shape.

Exports:

```ts
type LinkMode = "custom-scheme" | "https";

export function buildImportLink(args: {
    envelope: WireEnvelope;
    mode: LinkMode;
}): string;
```

Example output:

```text
jetlag-hide-seek-v2://import?d=...
https://<your-domain>/i?d=...
```

## 9.5 `src/sharing/links/parseLink.ts`

Responsibility:

- Parse incoming URLs.
- Extract supported query parameters.
- Return a decoded envelope or structured error.

Exports:

```ts
export type ParsedImportLink =
    | { ok: true; envelope: WireEnvelope; source: "payload" | "snapshot" }
    | { ok: false; error: ImportLinkError };

export function parseImportLink(url: string): ParsedImportLink;
```

Does not:

- Apply the import.
- Navigate the user.
- Show alerts.

## 9.6 `src/sharing/import/preview.ts`

Responsibility:

- Convert an envelope into a human-readable preview model.

Exports:

```ts
export type ImportPreview =
    | AppStateImportPreview
    | QuestionRequestImportPreview
    | QuestionAnswerImportPreview
    | TeamEventsImportPreview;

export function buildImportPreview(envelope: WireEnvelope): ImportPreview;
```

Example preview fields:

```ts
type QuestionRequestImportPreview = {
    kind: "question-request";
    title: string;
    subtitle: string;
    questionSummary: string;
    gameId: string;
    askedAt: string;
};
```

## 9.7 `src/sharing/import/applyImport.ts`

Responsibility:

- Apply a validated import to app state after confirmation.
- Handle replace vs merge behavior.
- Deduplicate events by id.

Exports:

```ts
type ImportApplyMode = "replace" | "merge" | "answer-question" | "apply-answer";

export function applyImport(args: {
    envelope: WireEnvelope;
    mode: ImportApplyMode;
    stores: AppStores;
}): ImportApplyResult;
```

Does:

- Mutate stores.
- Return a success/failure result.

Does not:

- Parse URLs.
- Show UI.

## 9.8 `src/sharing/import/ImportScreen.tsx`

Responsibility:

- UI route for incoming links.
- Decode incoming payload.
- Show validation errors.
- Show preview.
- Ask for confirmation.
- Call `applyImport` only after confirmation.

Possible path:

```text
mobile_v2/app/import.tsx
```

This route should delegate most logic to feature components:

```text
src/sharing/import/ImportScreen.tsx
src/sharing/import/ImportPreviewCard.tsx
src/sharing/import/ImportActions.tsx
```

## 9.9 `src/sharing/export/buildEnvelope.ts`

Responsibility:

- Convert current local app state into wire envelopes.

Exports:

```ts
export function buildAppStateEnvelope(args: {
    appState: CurrentAppState;
    include: AppStateShareSelection;
}): AppStateEnvelopeV1;

export function buildQuestionRequestEnvelope(args: {
    gameId: string;
    question: QuestionDraftV1;
    askedBy?: string;
}): QuestionRequestEnvelopeV1;

export function buildQuestionAnswerEnvelope(args: {
    gameId: string;
    request: QuestionRequestV1;
    answer: QuestionAnswerValueV1;
    answeredBy?: string;
}): QuestionAnswerEnvelopeV1;
```

## 9.10 `src/sharing/export/ShareSheet.tsx`

Responsibility:

- User-facing share UI.
- Uses React Native share sheet.
- Allows choosing custom-scheme or HTTPS link in dev settings.

Possible components:

```text
ShareSetupButton
ShareQuestionButton
ShareAnswerButton
ShareTeamUpdatesButton
```

## 9.11 `src/sharing/qr/QRCodeView.tsx`

Responsibility:

- Render a QR code for a share link.
- Show a fallback copy button.
- Warn when payload is very large.

Props:

```ts
type QRCodeViewProps = {
    title: string;
    link: string;
    onCopy: () => void;
    onShare: () => void;
};
```

## 9.12 `src/sharing/qr/QRCodeScanner.tsx`

Responsibility:

- Scan QR codes.
- Extract scanned URL.
- Pass URL to `parseImportLink`.
- Navigate to import preview.

This can be postponed. For MVP, system camera scanning of HTTPS links may be enough.

## 9.13 `src/sharing/paste/PasteImport.tsx`

Responsibility:

- Allow users to paste a raw link or raw payload.
- Parse and navigate to preview.

This is useful because some chat apps may not open custom schemes reliably.

## 9.14 `src/sharing/errors.ts`

Responsibility:

- Define structured import/export errors.
- Provide user-facing messages.

Example errors:

```ts
type ImportLinkError =
    | { code: "missing-payload" }
    | { code: "invalid-base64url" }
    | { code: "inflate-failed" }
    | { code: "invalid-json" }
    | { code: "schema-invalid"; details?: string }
    | { code: "unsupported-version"; version: number }
    | { code: "snapshot-fetch-not-supported" };
```

## 9.15 `src/sharing/migrations.ts`

Responsibility:

- Upgrade old envelopes to current app structures.
- Initially only supports v1.

Exports:

```ts
export function migrateEnvelope(envelope: unknown): WireEnvelope;
```

This file is mostly a placeholder at first, but adding it early avoids painting the app into a corner.

## 9.16 `src/sharing/security.ts`

Responsibility:

- Enforce size limits.
- Prevent accidental huge payload imports.
- Prevent unsupported external actions.

Suggested limits:

```text
Max encoded payload length: configurable, warn above 2 KB for QR
Max decoded JSON length: e.g. 512 KB
Max questions per import: e.g. 200
Max coordinates per custom polygon: e.g. 20,000
```

## 10. App config subcomponents

## 10.1 Custom scheme config

Already present in `app.json`:

```json
"scheme": "jetlag-hide-seek-v2"
```

Keep this for development and app-only sharing.

## 10.2 iOS Universal Links config

Future production config:

```json
"ios": {
    "associatedDomains": ["applinks:<your-domain>"]
}
```

Host:

```text
/.well-known/apple-app-site-association
```

## 10.3 Android App Links config

Future production config:

```json
"android": {
    "intentFilters": [
        {
            "action": "VIEW",
            "autoVerify": true,
            "data": [
                {
                    "scheme": "https",
                    "host": "<your-domain>",
                    "pathPrefix": "/i"
                }
            ],
            "category": ["BROWSABLE", "DEFAULT"]
        }
    ]
}
```

Host:

```text
/.well-known/assetlinks.json
```

## 11. User flows

## 11.1 Share initial game setup

```text
User opens Settings → Multiplayer / Sharing
User taps Share Setup
User selects sections:
  ✓ Play area
  ✓ Hiding zones
  ✓ Questions
  optional UI settings
App builds app-state envelope
App builds import link
User chooses:
  Share link
  Show QR
  Copy link
```

Receiver:

```text
Receiver opens link or scans QR
App opens ImportScreen
App decodes and validates envelope
App shows preview
Receiver chooses Replace or Merge
App applies state
App returns to map
```

## 11.2 Ask hider a question

```text
Seeker creates or opens question
Seeker taps Share with hider
App builds question-request envelope
App builds import link
Seeker sends link or shows QR
```

Hider:

```text
Hider opens link or scans QR
App shows Answer Question screen
Hider answers
App builds question-answer envelope
Hider sends answer link or shows QR
```

Seeker:

```text
Seeker opens answer link
App shows answer preview
Seeker taps Apply Answer
App adds locked/applied question to question list
Map recomputes elimination state
```

## 11.3 Share answer with teammates

```text
Seeker applies hider answer locally
Seeker taps Share Team Update
App builds team-events envelope
Teammate opens link
App previews event list
Teammate taps Apply
App deduplicates already-applied events
App applies new events
```

## 11.4 Paste fallback

```text
User copies link from chat
User opens Settings → Copy/Paste State
User pastes link or raw payload
App parses and previews
User confirms import
```

This is important for custom-scheme links and chat apps that do not auto-open links reliably.

## 12. Import behavior by envelope kind

## 12.1 `app-state`

Default action:

```text
Replace current game setup
```

Optional action:

```text
Merge selected sections
```

Preview should show:

- Game id
- Play area label
- Hiding-zone presets
- Radius
- Number of questions
- Timestamp

## 12.2 `question-request`

Default action:

```text
Answer question
```

Preview should show:

- Question type
- Question summary
- Asking player/team if present
- Game id mismatch warning if current local game differs

Do not apply to seeker question list as a locked answer. This payload is for the hider to answer.

## 12.3 `question-answer`

Default action:

```text
Apply answer
```

Preview should show:

- Original question summary
- Answer summary
- Hider name/team if present
- Timestamp
- Game id mismatch warning

Apply behavior:

- If matching request id exists locally, update that question.
- If not, offer to add as imported answered question.
- Mark the question as locked/applied.

## 12.4 `team-events`

Default action:

```text
Merge events
```

Preview should show:

- Number of total events
- Number of new events
- Number of duplicates
- Event summaries

Apply behavior:

- Ignore already-applied event ids.
- Apply new events in timestamp or declared order.

## 13. State integration

## 13.1 Current stores

Current `mobile_v2` has separate providers for play area and hiding zones.

This feature can start by integrating with:

```text
PlayAreaProvider
HidingZoneProvider
```

As question state is added, introduce:

```text
QuestionProvider
GameProvider
SharingProvider
```

## 13.2 Recommended provider shape

Eventually wrap the app like:

```tsx
<GameProvider>
    <PlayAreaProvider>
        <HidingZoneProvider>
            <QuestionProvider>
                <SharingProvider>
                    <MapAppScreenContent />
                </SharingProvider>
            </QuestionProvider>
        </HidingZoneProvider>
    </PlayAreaProvider>
</GameProvider>
```

Alternatively, consolidate into a single domain store if provider nesting becomes cumbersome.

## 13.3 AppStores adapter

Do not let `applyImport` import React contexts directly.

Instead define an adapter:

```ts
type AppStores = {
    game: GameStoreApi;
    playArea: PlayAreaStoreApi;
    hidingZones: HidingZoneStoreApi;
    questions: QuestionStoreApi;
    appliedEvents: AppliedEventStoreApi;
};
```

The UI route can assemble this adapter from hooks and pass it into `applyImport`.

## 14. Navigation integration

## 14.1 Incoming link while app is cold

```text
OS opens app
Expo Router routes to /import
ImportScreen parses URL params
Preview renders
```

## 14.2 Incoming link while app is already open

```text
Link event received
Navigate to /import with params
Preview renders over current app context
```

## 14.3 Return destination

After successful import:

- `app-state`: return to map.
- `question-request`: return to answer-complete/share-answer screen.
- `question-answer`: return to question detail or map.
- `team-events`: return to map.

## 15. UI components

## 15.1 `MultiplayerSharingScreen`

Location:

```text
src/features/sheet/MultiplayerSharingScreen.tsx
```

Contains:

- Share setup
- Import from clipboard
- Show QR for current setup
- Scan QR
- Developer toggle for custom-scheme vs HTTPS links

## 15.2 `ShareSetupScreen`

Contains checkboxes:

- Play area
- Hiding zones
- Questions
- UI settings

Actions:

- Copy link
- Share link
- Show QR

## 15.3 `QuestionShareActions`

Location:

```text
src/features/questions/QuestionShareActions.tsx
```

Actions:

- Share with hider
- Show QR for hider
- Paste answer
- Share latest answer with teammates

## 15.4 `ImportPreviewCard`

Displays a normalized preview regardless of envelope kind.

Props:

```ts
type ImportPreviewCardProps = {
    preview: ImportPreview;
};
```

## 15.5 `ImportActions`

Renders valid actions for the current envelope kind.

Examples:

```text
Replace current game
Merge selected sections
Answer question
Apply answer
Cancel
```

## 15.6 `QRCodeModal`

Reusable modal/sheet for showing QR codes.

Props:

```ts
type QRCodeModalProps = {
    title: string;
    link: string;
    visible: boolean;
    onClose: () => void;
};
```

## 16. Validation and safety rules

- Always validate with Zod before preview.
- Never apply an import directly from URL open.
- Show warnings for game id mismatch.
- Show warnings for large payloads.
- Reject unsupported versions.
- Reject unknown envelope kinds.
- Keep hider exact location out of all envelopes.
- Avoid importing UI-only preferences unless the user explicitly included them.
- Treat imported display names as untrusted text.

## 17. Conflict handling

Initial simple policy:

### 17.1 App setup import

If importing a full setup:

- Default to replace.
- Offer merge only if partial sections are present.

### 17.2 Question answer import

If request id matches a local pending question:

- Update that pending question.

If request id does not match:

- Offer to add as imported answered question.

If request id already has an answer:

- Show existing answer and incoming answer.
- Ask whether to keep existing or replace.

### 17.3 Team events

- Deduplicate by event id.
- Apply in declared order.
- Skip events for obviously different game ids unless user confirms.

## 18. Testing plan

## 18.1 Unit tests

Add tests for:

```text
canonicalize
base64url encode/decode
encodeEnvelope/decodeEnvelopePayload
schema validation
invalid payload errors
preview generation
applyImport behavior
idempotent team-event import
```

## 18.2 Integration tests

Add tests for:

```text
custom-scheme URL parsing
HTTPS URL parsing
ImportScreen with app-state
ImportScreen with question-request
ImportScreen with question-answer
large payload warning
unsupported version error
```

## 18.3 E2E tests

Possible Maestro flows:

```text
Share setup → copy link → paste import → preview → apply
Ask question → generate link → import as hider → answer → generate answer link
Import answer → apply → question appears locked/applied
```

## 19. Milestone plan

## 19.1 Milestone 1: wire codec only

Deliver:

- `WireEnvelope` schemas
- canonicalization
- encode/decode
- unit tests

No UI yet.

## 19.2 Milestone 2: custom-scheme import route

Deliver:

- `/import` route
- parse `d` param
- decode envelope
- preview app-state and question-request
- no actual state mutation yet

## 19.3 Milestone 3: share setup link

Deliver:

- Share setup UI
- Build `app-state` envelope from current play area/hiding-zone stores
- Copy/share custom-scheme link
- Import setup with confirmation

## 19.4 Milestone 4: question request/answer links

Deliver:

- Build question-request envelope
- Import question request as hider
- Answer question
- Build question-answer envelope
- Import answer as seeker

## 19.5 Milestone 5: QR display

Deliver:

- QR modal for setup links
- QR modal for question links
- QR modal for answer links
- Copy/share fallback

## 19.6 Milestone 6: paste fallback

Deliver:

- Paste link/payload modal
- Same preview/apply path as deep links

## 19.7 Milestone 7: HTTPS universal/app links

Deliver:

- Domain decision
- iOS Associated Domains
- Android App Links intent filters
- Hosted verification files
- Fallback web page

## 19.8 Milestone 8: QR scanner

Deliver:

- In-app scanner
- Scanned URL goes through same parser and preview path

## 20. Suggested file tree

```text
mobile_v2/
  app/
    import.tsx

  src/
    sharing/
      wire/
        schema.ts
        canonicalize.ts
        codec.ts
        base64url.ts
        migrations.ts
      links/
        buildLink.ts
        parseLink.ts
      export/
        buildEnvelope.ts
        ShareSetupScreen.tsx
        ShareActions.tsx
      import/
        ImportScreen.tsx
        ImportPreviewCard.tsx
        ImportActions.tsx
        applyImport.ts
        preview.ts
      qr/
        QRCodeModal.tsx
        QRCodeView.tsx
        QRCodeScanner.tsx
      paste/
        PasteImport.tsx
      errors.ts
      security.ts

    features/
      sheet/
        MultiplayerSharingScreen.tsx
      questions/
        QuestionShareActions.tsx
```

## 21. Open questions

1. What should the production domain be?
2. Should initial HTTPS links contain direct payloads, or should HTTPS support only snapshot ids?
3. What is the maximum practical QR payload size before forcing snapshot links?
4. Should UI settings be imported by default, or opt-in only?
5. Should game ids be user-visible?
6. How much question schema should be shared with the legacy web app?
7. Should hider answers include a display name/team name?
8. Should imported question answers be editable, or always locked?
9. Should QR scanner be in v1, or should the system camera be enough?

## 22. Recommended first PR

The first PR should avoid UI complexity and implement only the core codec.

Scope:

```text
src/sharing/wire/schema.ts
src/sharing/wire/canonicalize.ts
src/sharing/wire/base64url.ts
src/sharing/wire/codec.ts
src/sharing/errors.ts
unit tests
```

Acceptance criteria:

- Can encode and decode an `app-state` envelope.
- Can encode and decode a `question-request` envelope.
- Can encode and decode a `question-answer` envelope.
- Invalid payloads return structured errors.
- Unsupported versions are rejected.
- Encoded payloads are URL-safe.
- Canonicalization is deterministic.

## 23. Summary

The sharing system should be built as a small transport-agnostic protocol, not as one-off copy/paste UI.

The key rule:

```text
Deep link, QR code, share sheet, pasted URL, and future snapshot server should all produce the same validated WireEnvelope.
```

That gives `mobile_v2` a practical serverless multiplayer path now while preserving a clean upgrade path to HTTPS links, snapshot links, and live rooms later.
