# Cursor User Rules Storage Notes

## Global rule files
- The Cursor desktop app stores each global "Rules and Config" entry as Markdown files under `~/Library/Application Support/Cursor/User/History/<hash>/`.
- Every rule folder contains multiple `.md` copies (for example `OVGe.md`, `BDkg.md`, etc.) that all mirror the text shown in the UI. These are the files to back up/edit when exporting rules.
- The same folder also includes an `entries.json` with metadata (timestamps, IDs) that Cursor uses internally; it is not required when copying text.

## Example (rule reminding agent to ask clarifying questions)
- Files located at `~/Library/Application Support/Cursor/User/History/5dbb075c/`:
  - `OVGe.md`, `BDkg.md`, `N4sE.md`, `NSdP.md`, `7oPW.md`: contain the full rule content ("Expert AI Programming Assistant" instructions).
  - `entries.json`: metadata that can be ignored unless you need Cursor’s IDs.

## How to extract your current rules
1. `cd ~/Library/Application\ Support/Cursor/User/History`.
2. Inspect the folders (each is a short hash) and open the `.md` file(s) inside to read or copy the rule text.
3. To find a specific line (e.g. "yarn install fails"), use ripgrep: `rg -n "yarn install fails" "~/Library/Application Support/Cursor/User/History"`.
4. The matches show the exact hash + file name, so you can open and archive that Markdown.

## Key takeaways
- Cursor does **not** save those rules in `settings.json`; the History tree is the source of truth.
- The `.md` files are plain text and safe to version-control or back up.
- Searching within `~/Library/Application Support/Cursor/User/History` is the quickest way to locate any current rule snippet.
- `sync-agents --export-cursor-history --cursor-history-dest "~/.cursor/AGENTS.md"` can aggregate every history rule into a single file (adjust the destination if you prefer a different path).
