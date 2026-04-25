# Chess Plus

Browser-based chess variant prototype with modular rule drafting.

## What it does

- Lets one local player control both white and black.
- Uses pseudo-legal chess movement, so kings can move into check or stay there.
- Ends the game only when a king is captured.
- Triggers a rule draft every 6 half-moves.
- Alternates the drafting side each time, starting with Black.
- Supports permanent, temporary, and instant rule effects that stack.

## Run it

Do not open `index.html` directly from `file://` because browsers block module loading there.

Run a tiny static server instead:

```powershell
.\start.ps1
```

Then open `http://localhost:8000`.

Alternative:

```powershell
npm start
```
