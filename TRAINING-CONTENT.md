# Training Content Design

This document explains how the two training systems in the app work:

- `Polgar` tactical mate puzzles
- `Silman`-style endgame training

It covers where the content lives, how positions are selected, how spaced repetition works, and how to extend each system safely.

## Overview

The app has two content pipelines:

1. `Polgar`
   Source file: `backend/data/polgar_puzzles.json`
   Delivery route: `GET /api/puzzle/polgar`
   Frontend entry point: `frontend/src/components/GameMenu.tsx`

2. `Endgame`
   Source file: `backend/data/endgames.json`
   Delivery route: `GET /api/puzzle/endgame`
   Frontend entry point: `frontend/src/components/GameMenu.tsx`

Both systems share the same persistence layer:

- Progress storage: `backend/db.ts`
- Save endpoint: `POST /api/progress/:puzzleId`
- Stats endpoint: `GET /api/puzzle/stats`

## Shared Repetition Model

Progress is stored in the SQLite table `puzzle_progress`.

Important fields:

- `user_id`: owner of the training record
- `puzzle_id`: stable content id, for example `polgar-342` or `endgame-silman-c-3`
- `interval`, `ease`: SRS scheduling values
- `attempts`, `successes`: aggregate accuracy counters
- `next_due`: next review date

Scheduling logic lives in `backend/index.ts` in `calcSRS()`:

- Success:
  interval grows by `ceil(interval * ease)`
  ease increases up to `3.0`
- Failure:
  interval resets to `1`
  ease decreases down to `1.3`

Due items are computed in `backend/db.ts` by parsing `next_due` as a real `Date`.

## Polgar Puzzle Design

### Data Source

Polgar puzzles live in:

- [backend/data/polgar_puzzles.json](/Users/pavelhumeniuk/src/chess/backend/data/polgar_puzzles.json)

Each entry includes:

- `problemid`
- `type`
- `fen`
- `moves`

The app converts each puzzle to a stable runtime id:

- `polgar-${problemid}`

### Selection Flow

Backend route:

- [backend/index.ts](/Users/pavelhumeniuk/src/chess/backend/index.ts)
  `GET /api/puzzle/polgar`

Request query:

- `type=Mate in One`
- `type=Mate in Two: 307-806`
- `type=Mate in Three`
- `type=Review Due`

Selection rules:

1. `Review Due`
   Only returns Polgar puzzles whose saved ids are currently due.

2. Named categories
   Filters by the puzzle `type`.

3. `Mate in Two` chunks
   Filters by real 500-puzzle blocks, not raw numeric windows.
   Current chunk labels come from the actual sorted mate-in-two problem list:
   - `307-806`
   - `807-1307`
   - `1308-1807`
   - `1808-2307`
   - `2308-2807`
   - `2808-3307`
   - `3308-4362`

4. Seen filtering
   For non-review categories, already-seen puzzles are filtered out first.

5. Random choice
   One position is chosen randomly from the remaining pool.

The backend also returns:

- `categoryRemaining`
- `categoryTotal`

Those are used for the sidebar progress bar.

### How Move Validation Works

Frontend puzzle flow lives in:

- [frontend/src/hooks/usePuzzles.ts](/Users/pavelhumeniuk/src/chess/frontend/src/hooks/usePuzzles.ts)

There are now two Polgar behaviors:

1. Standard line-following puzzles
   Used for categories like `Mate in One`
   The app checks your moves against the stored solution sequence.

2. Mate-in-N training with engine defense
   Used for `Mate in Two` and `Mate in Three`
   The app does not verify every move against the original line.
   Instead:
   - you make a White move
   - Stockfish chooses Black's best defense
   - you continue until mate or until you run out of allowed White moves

This is designed to feel more like solving a real mating net than replaying a fixed script.

### How Results Are Saved

Frontend save call:

- [frontend/src/engine/eval.ts](/Users/pavelhumeniuk/src/chess/frontend/src/engine/eval.ts)
  `reportPuzzleResult(id, success)`

Backend save route:

- [backend/index.ts](/Users/pavelhumeniuk/src/chess/backend/index.ts)
  `POST /api/progress/:puzzleId`

Rules:

- Success on solve: saves `success=true`
- Failure on wrong move / failed mate window: saves `success=false`

### How To Extend Polgar

To add new Polgar-style categories:

1. Add or import new records into `backend/data/polgar_puzzles.json`
2. Make sure each puzzle has a stable `problemid`
3. Update the Polgar menu in:
   [frontend/src/components/GameMenu.tsx](/Users/pavelhumeniuk/src/chess/frontend/src/components/GameMenu.tsx)
4. If the new category needs custom logic, update:
   [frontend/src/hooks/usePuzzles.ts](/Users/pavelhumeniuk/src/chess/frontend/src/hooks/usePuzzles.ts)
5. If selection rules differ, update:
   [backend/index.ts](/Users/pavelhumeniuk/src/chess/backend/index.ts)

If you introduce a new family of ids, keep the `polgar-` prefix for Polgar items so stats filtering continues to work.

## Silman Endgame Design

### Data Source

Endgames live in:

- [backend/data/endgames.json](/Users/pavelhumeniuk/src/chess/backend/data/endgames.json)

During deployment, this JSON is copied into the backend build output at `dist/data/endgames.json`. The persistent Docker volume should keep only `chess.db`, not training content.

Each endgame record includes:

- `id`
- `level`
- `levelLabel`
- `chapter`
- `name`
- `fen`
- `side`
- `description`

The ids are prefixed with:

- `endgame-...`

That prefix is important because it lets the backend separate endgame repetition stats from Polgar stats.

### Source Philosophy

This endgame set is Silman-structured, not a verbatim dump of the book.

What was used:

- Silman-style rating bands
- Silman-style chapter concepts
- custom/manual FEN positions aligned to those themes

This keeps the app organized like a curriculum while avoiding copying book content verbatim.

### Selection Flow

Backend route:

- [backend/index.ts](/Users/pavelhumeniuk/src/chess/backend/index.ts)
  `GET /api/puzzle/endgame?level=...`

Frontend passes the selected level from:

- [frontend/src/components/GameMenu.tsx](/Users/pavelhumeniuk/src/chess/frontend/src/components/GameMenu.tsx)

Examples:

- `beginner_class_d`
- `class_c`
- `class_b`
- `class_a`
- `experts`
- `masters`

Selection rules:

1. Filter positions by selected `level`
2. Prefer due endgames first
3. If nothing is due, prefer unseen endgames
4. If everything has been seen, fall back to the whole level pool
5. Return one random endgame from that pool

The backend also returns:

- `categoryRemaining`
- `categoryTotal`

For endgames these mean progress inside the selected Silman level.

### How Endgame Results Are Saved

Endgames do not use a scripted move list.

Instead, the app treats the final game result as the training outcome:

- Win the endgame: success
- Fail / draw / get mated: failure

Frontend result reporting is triggered in:

- [frontend/src/App.tsx](/Users/pavelhumeniuk/src/chess/frontend/src/App.tsx)

When an endgame reaches a terminal state:

- `checkmate` with the player as winner -> `success=true`
- `stalemate`, `draw`, or losing `checkmate` -> `success=false`

That result is saved through the same shared repetition endpoint:

- `POST /api/progress/:puzzleId`

### Endgame Sidebar and Stats

Endgame description and stats are shown in:

- [frontend/src/App.tsx](/Users/pavelhumeniuk/src/chess/frontend/src/App.tsx)

The sidebar displays:

- endgame name
- Silman level
- chapter
- description
- level progress
- endgame-only statistics

Stats are requested with:

- `GET /api/puzzle/stats?kind=endgame`

Backend filters by `puzzle_id.startsWith('endgame-')`.

### How To Extend Endgames

To add more endgames:

1. Edit:
   [backend/data/endgames.json](/Users/pavelhumeniuk/src/chess/backend/data/endgames.json)
2. Use a unique id with the `endgame-` prefix
3. Set:
   - `level`
   - `levelLabel`
   - `chapter`
   - `name`
   - `fen`
   - `side`
   - `description`
4. Keep the FEN legal and aligned with the `side` to move
5. If you add a new level, also update:
   [frontend/src/components/GameMenu.tsx](/Users/pavelhumeniuk/src/chess/frontend/src/components/GameMenu.tsx)

## Frontend Files To Know

- [frontend/src/App.tsx](/Users/pavelhumeniuk/src/chess/frontend/src/App.tsx)
  Main mode switching, training state, endgame result reporting, sidebar rendering

- [frontend/src/hooks/usePuzzles.ts](/Users/pavelhumeniuk/src/chess/frontend/src/hooks/usePuzzles.ts)
  Polgar solve logic, mate-in-N engine-reply behavior, stats refresh

- [frontend/src/engine/eval.ts](/Users/pavelhumeniuk/src/chess/frontend/src/engine/eval.ts)
  API client for puzzle fetching, stats, and progress reporting

- [frontend/src/components/GameMenu.tsx](/Users/pavelhumeniuk/src/chess/frontend/src/components/GameMenu.tsx)
  User-facing content selectors

## Backend Files To Know

- [backend/index.ts](/Users/pavelhumeniuk/src/chess/backend/index.ts)
  Selection rules, progress save endpoint, stats endpoint, Stockfish access

- [backend/db.ts](/Users/pavelhumeniuk/src/chess/backend/db.ts)
  SQLite schema, progress access helpers, due-date logic

- [backend/data/polgar_puzzles.json](/Users/pavelhumeniuk/src/chess/backend/data/polgar_puzzles.json)
  Raw Polgar puzzle dataset

- [backend/data/endgames.json](/Users/pavelhumeniuk/src/chess/backend/data/endgames.json)
  Silman-structured endgame curriculum

## Testing

Useful regression tests:

- [frontend/src/__tests__/e2e.test.tsx](/Users/pavelhumeniuk/src/chess/frontend/src/__tests__/e2e.test.tsx)
- [frontend/src/engine/eval.test.ts](/Users/pavelhumeniuk/src/chess/frontend/src/engine/eval.test.ts)
- [backend/test/api.test.ts](/Users/pavelhumeniuk/src/chess/backend/test/api.test.ts)

If you change selection rules, chunking, repetition logic, or stats filtering, add or update tests in those files.
