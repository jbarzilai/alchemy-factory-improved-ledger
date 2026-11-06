# Game data scripts

These scripts regenerate `config/item-names.json` (internal item ID to English name) from the game install. No CLI
command does that yet. Prices and icons come from the CLI: `af-ledger refresh-game-data` and `af-ledger refresh-icons`.

They only read the install (never a save) and need the Linux `kdec` (`npm run build:native`). Run them from this
folder; the outputs go to the repo's git-ignored `.cache/`.

1. Extract the item table from the IoStore container. `<game>` is the Alchemy Factory install folder (`AF_GAME_DIR`):

   ```sh
   mkdir -p ../../.cache/dt
   node extract.mjs "<game>/AlchemyFactory/Content/Paks/AlchemyFactory-Windows.utoc" DataTables/DT_Enemies.uasset ../../.cache/dt/DT_Enemies.uasset
   ```

2. Read the names. `pak.py` finds the English `Game.locres` in `AlchemyFactory-Windows.pak` through `AF_GAME_DIR`,
   from the environment or the repo's `.env`:

   ```sh
   python3 -B item_names.py ../../.cache/dt/DT_Enemies.uasset > ../../.cache/item-names.json
   ```

3. Copy the result over `config/item-names.json`, keeping its `_comment` line.

How the files are laid out is in `docs/SAVE_FORMAT.md` §9. `utoc.mjs` reads the IoStore table of contents and `zen.py`
the cooked asset's name map.
