# Alchemy Factory `.sav` Format (as reverse-engineered)

Verified on 7 saves from slot `1 Point Oh_2609135133 - Claude` (game days 163–199, Oct 2026).
Game build in header: SaveGameVersion Major 1, Minor 4, Revision 1, BuildNumber 5024 (0x13A0). This repo writes it
"1.4.1 build 5024"; the mod authors write the same build as "1.1.5024".
All integers are little-endian.

## 1. File layout

```
[ "CHAF" outer header + uncompressed property list ]   ~827 bytes
[ 13-byte compressed-body header ]
[ block 0 header (20 B) ][ block 0 Kraken data ]
[ block 1 header (20 B) ][ block 1 Kraken data ]
...                                                     (68 blocks in a Day-199 save)
```

### 1.1 Outer header
Bytes 0–4 are the signature `D5 43 48 41 46` (`.CHAF`), bytes 5–8 are a u32 `headerLength`
(header-property length), and bytes 9–11 are `50 4B 47` (`PKG`). A tagged property list (section 3)
occupies `[12, 12 + headerLength)`, beginning at offset 12 (`0A 00 00 00 "IsSandbox"`). The two `None`
terminators end the `Version` struct and the outer list. The length varies with the save-name length:

| Save (game 1.4.1 / 5024) | Name | headerLength (u32 @5) | Body header offset |
|---|---|---|---|
| Fixture `SaveGame3.sav` | "1 Point Oh" | 815 | 827 |
| `Sand_2609215977/*.sav` | "Sand" | 809 | 821 |

| Property | Type | Example | Notes |
|---|---|---|---|
| IsSandbox | Bool | false | |
| Day | Int | 199 | 0-based current day |
| Level | Int | 6 | |
| Gold | Int | 0 / 800 / 500 | wallet: copper coins carried (see below) |
| GoldSilver | Int | 3322 / 2718 | wallet: silver coins carried |
| GoldGold | Int | 0 / 40 / 147 | wallet: gold coins carried |
| CompressedSize / UncompressedSize | Int64 | 0 / 0 | placeholders, always 0 |
| Name | Str | "1 Point Oh" | |
| Desc | Str | "" | |
| SaveTime | Struct DateTime | int64 ticks | 100 ns ticks since 0001-01-01, PC local time (matches file mtime) |
| Version | Struct SaveGameVersion | Major/Minor/Revision/BuildNumber | |

**Wallet fields (confirmed 2026-10-28):** `GoldGold` / `GoldSilver` / `Gold` are the gold / silver / copper coins in the
player's inventory. The Claude-slot `SaveGame0.sav` holds 97 / 2,699 / 0, matching the in-game inventory.
Counts are not normalized (silver can exceed 100). **Not used in any calculation:** coins are a physical game item that
moves between the player's inventory and storage, so these fields are unrelated to shop income, profit or the business
balance. Recorded only for completeness.

The body header starts at `12 + headerLength`.

### 1.2 Compressed-body header (13 bytes)
`B7 CF D5 50` (magic) · `03` (unknown; compression method?) · u32 block count (0x44 = 68) · 4 bytes (hash/checksum?).

### 1.3 Block chain
Each block: `u32 compressedSize` · `u64 uncompressedSize` · `u64 compressedSize (repeat)` · data.
Data starts with `8C 06` (Oodle Kraken). Walk until EOF — the chain covers the file exactly.
Block 0 uncompressed ≈ 58.7 MB; most others 0x04000068 (64 MiB + 104 B), tail blocks smaller.

**All ledger data is in block 0.** Other blocks: grid/entities/belts/splines (no money data).

## 2. Block 0 layout
Begins with a name table (u32 count, then FStrings: `UGameSaveLoadSubsystem`, `PlayerController`,
`GameState`, `SpatialGrid`, ..., top-level field names per object). Then the object bodies as a
sequence of **property blocks**, each a list of tagged properties ending in `None`.

GameState body blocks, in file order (offsets from `SaveGame3.sav`, will shift between saves —
always locate by searching for the property name tag):

| Block (offset) | Properties | Meaning |
|---|---|---|
| ~46363 | MailBoxGenerator, TutorialData | CommonSaved |
| ~46835 | **IngredientCounts** | **today's running tally (in-progress day)** |
| ~93820 | ConstructOptionList ... UnlockedLicenseList | UnlockData |
| ~102018 | **DailyIngredients** | **one entry per completed day** |
| then | GameName, PlayerLevel, YesterdayLevel, DynamicReputation, StoreOpen, ... | PlayerData |
| then | CurrentExp, LoreLevel, UnallocatedPoints, RefundTimes | LoreData |
| then | GameDays (int), GameSeconds (double) | TimeDay |
| then | CurrentRandomCount, LastRandomDay, ..., CompletedQuests, SpawnedQuests | QuestSystem |
| then | Loans | LoanSystem |

Locating a property: search for `u32(len(name)+1) name "\0"`, then confirm the following FString ends in `Property`.

## 3. Tagged property encoding (Unreal 5.5 "complete type name" format)

```
FString  Name                     // "None" terminates the list
TypeName Type                     // recursive: FString name, i32 paramCount, then paramCount TypeNames
i32      Size                     // bytes of value
u8       Flags                    // 0x01 ArrayIndex follows (i32), 0x02 PropertyGuid (16 B),
                                  // 0x04 extensions, 0x08 binary/native serialized, 0x10 bool=true
value    (Size bytes)
```
FString: i32 length incl. NUL; positive = Latin-1, negative = UTF-16LE (length in chars).

Type examples:
- `IntProperty` (0 params)
- `StructProperty` → [`IntVector` → [`/Script/CoreUObject`]]
- `ArrayProperty` → [`StructProperty` → [`IngredientRecordData` → [`/Script/BeltTD`]]]

Values:
- Bool: no bytes; value is `Flags & 0x10`.
- Int/Int64/Float/Double/UInt*: raw.
- Name/Str: FString.
- Struct: native structs are raw (IntVector = 3×i32, Vector = 3×f64, DateTime = i64 ticks, Guid = 16 B);
  other structs are a nested property list ending in `None`.
- Array: i32 count, then elements. Struct elements are nested property lists (no per-element tag).
- Map: i32 removedCount, i32 count, then key/value pairs.
- TextProperty: complex; skip by Size (not needed).

Always advance to `start + Size` after reading a value and flag any mismatch — this is what makes
the parser robust.

## 4. Ledger structures

### DailyIngredients
`Array<IngredientRecordArray>`; index `i` = save day `i` = **in-game Day i+1**.
```
IngredientRecordArray { Records: Array<IngredientRecordData>, ProfitCoef: double }
IngredientRecordData {
  IngredientName: Name
  RestockCount: Int           // Purchasing Cost screen: count (no price stored)
  SellCount: Int              // Shop Income screen: count
  SellProfit: IntVector       // Shop Income screen: amount
  ProduceCount: Int
  DispatchedCount: Int        // Order Income screen: count
  DispatchProfit: IntVector   // Order Income screen: amount
  ConsumeCount: Int
}
```
`IngredientCounts` (current day) is a flat `Array<IngredientRecordData>` with the same shape.
It grows during the day and is appended to DailyIngredients at day end.

`ProfitCoef` history in this save: 1.0 (days 0–48), 1.1 (49–95), 1.2 (96+). It equals the
in-game "Shop Profit" bonus (120%).

### Money: IntVector = (gold, silver, copper)
1 gold = 100 silver = 100,000 copper; 1 silver = 1,000 copper.
Copper-equivalent = `x*100000 + y*1000 + z`.
Items priced in silver in-game (Mars, Saturn, Jupiter; all dispatch rewards seen so far) store
their value in `y`; copper items use `z`. `x` only seen in quest awards (e.g. Main7: `(6,0,0)`).

### Quests (QuestSystem.CompletedQuests / SpawnedQuests)
Verified directly in the fixture's `CompletedQuests`: `Array<ProcessQuest>` (274 entries), with
`IsRandom`/`IsMain` (Bool), `UniqueID`, `AcceptDate` (Int: 0-based day), `QuestID` (Name, e.g.
RandomNormal, RandomBulk, RandomUrgent, Main7), `Title`/`Message` (Text), `RequireProducts`
(`Array<BeltTDIngredientCount>` with `IngredientName: Name`, `Count: Int`), `DateRange` (IntPoint),
`SubmitData` (Int: 0-based day submitted; the spelling is **Data**, not Date), and `Awards`
(`QuestComplexAward` with `Gold: IntVector`, `GoldFactor: Double`, Products, Buildings, Contracts,
LevelUp). The extractor uses these fields directly; no alternate quest mapping is needed.
Random quests store `Gold = (0,0,0)` and only `GoldFactor` (Normal 1.3, Bulk 1.6, Urgent 2.0),
so the actual payout is **not stored**.
The two fixture quests with `SubmitData = 198` are RandomNormal (accepted 198; requires Nails 90,
Jupiter 1, Catalyst1 25) and RandomBulk (accepted 197; requires PocketWatch 20, Salt 320, BlastPotion 60,
IronIngot 120). Both have zero Gold. Their stored Double values are `1.2999999523162842` and
`1.600000023841858`; preserve those values rather than rounding them to the nominal multipliers.

#### Random quest payout (fitted 2026-10-26; not stored)
> **Superseded 2026-10-27 (§10):** quests value items at the game's `QuestCost`, not the shop base. With `QuestCost`
> every check below reproduces to ≤5c, Day 208 included. The fitted values were partly wrong: Salt is 130 for quests
> (100 in the shop), so PocketWatch is 2000, not 2480; Catalyst2 4222, Topaz 2800, PerfumedSoap 2590. The formula stands.
Data: quest-board screenshots of the 4 open random quests in `1 Point Oh_2609135133 - Claude/SaveGame0.sav`
(UI Day 202; `SpawnedQuests` UniqueID 356–359) plus the Day 199 total, with the bonus screen showing
Shop Profit 120%, Sundries/Potion 180%, Beverage/Relic 140%, Jewelry 124%, Quest Rewards 128%.
- **Shop unit price = floor(base × (1 + (Shop−1) + (Category−1)))**: additive bonuses (Sundries/Potion ×2.0,
  Relic ×1.6, Jewelry ×1.44). Bases from day-202 sales: Salt 100, Brick 70, CopperBearing 300, Nails 16,
  Turquoise 290 (417.6 → 417), GrowthPotion 1224, Saturn 150,000, Jupiter 30,000; BlastPotion 2557 (Day 190 sale).
- **Payout ≈ Σ(count × base) × GoldFactor × QuestRewards.** UniqueID 358 (RandomBulk: CopperBearing 160,
  BlastPotion 60, Brick 120, Turquoise 40), with every base known from sales, predicts 453,468c; the board shows
  450s 3,471c = 453,471c. Solving the others gives Catalyst1 1340, PocketWatch 2480 (its Day 133 sale of 2000
  disagrees; unexplained), IronIngot 25, PerfumedSoap 2290. Those then reproduce Day 199's 595,529c to 4c.
- Ledger checks on single-quest days (the ledger shows only the day total):
  - Day 200, RandomUrgent BlastPotion 90: 90×2557×2.0×1.28 = 589,132.8; ledger 5g 85s 4,133c = 589,133. Exact
    (so Urgent = 2.0 and rounding is to the nearest copper).
  - Day 181, RandomBulk with BlackPowder 150 (base 660), GrowthPotion 60 (1224), Malachite 40 (1020), Glass 110 (75),
    HealingPotion 60 (85): predicted 464,056.3; ledger 460s 4,060c = 464,060. So the bonus was already 1.28 on Day 181.
- Residuals: 0 for the single-item quest; +0.2 to +4.6c for multi-item quests. Independent checks (all bases from
  sales): UniqueID 358 is +2.8c and Day 181 is +3.7c. Both include a 40-count jewelry item, so the Jewelry bases
  derived via ×1.44 may be slightly low. The rule is not pinned down; it is immaterial (≈1e-5 of the payout).
- **Catalyst2 4392, Topaz 2647** (fitted 2026-10-27; neither is ever sold in the shop). UI Day 208 ledger: Quest
  Rewards 5g 435s 9,117c = 944,117c for three quests. Two RandomNormals are fully priced (101,254 + 185,270c), and the
  RandomBulk is VitalityPotion 60, PerfumedSoap 32, Nails 180, Catalyst2 36, Catalyst1 50, which gives Catalyst2 = 4392.5.
  Board quest 371 (RandomNormal: ManaPotion 30, Topaz 20, Catalyst2 18) shows 250s 593c = 250,593c, so
  20·Topaz + 18·Catalyst2 ≈ 131,996. With 4392 that gives Topaz = 2647.04, so 4392 is used. With these values quest
  371 is +1.3c, but Day 208 is computed 38c low. Fertile Catalyst moves in 74c steps there (36 × 1.6 × 1.28), and 4393
  would be 36c high. So whole-number bases don't fit everything to 5c. A likely cause is that bases taken from sales are
  only bounded: floor(base × mult) = unit allows base ∈ [unit/mult, (unit+1)/mult), e.g. Nails 16–16.5. Immaterial
  (4e-5 of the payout). Order prices are not base prices: Catalyst2 dispatches at 4,300c and Bandage at 340c (base 350).
- **The in-game ledger recalculates past quest totals; it doesn't store them.** No past quest total is anywhere in the save
  (all blocks searched as int32/int64/float/double and every gold/silver/copper split). Respec test on the Day 200
  ledger: 5g 85s 4,133c at +28%; after removing every Customer Management level, 460s 260c = 460,260 =
  90×2557×2.0 exactly. So the game's own ledger uses the **current** Quest Rewards bonus. Reading the bonus from the
  save's skills reproduces the in-game ledger as of save time. The bonus actually in effect at submission is
  unknowable to the game too.
- Same respec test (every skill zeroed except Order Income): Day 200 **shop lines unchanged**, so shop income is historical,
  as stored. Orders weren't tested (Order Income kept), but `DispatchProfit` is stored per day. Purchasing is computed
  (count × price); prices seeded before the respec still matched after it.
- Skill state: a second skill-name list (in the NPC/shop data near `CheckoutKeyData`/`NPCQueueData`) holds the shop and
  quest skills (`QuestSkill1–4`, `BargainingSkill1–4`, `*Profit1–5`). There are also `UnallocatedPoints` and `RefundTimes`
  (respec count: 3 in both SaveGame0 and SaveGame5). **Respecs rewrite both lists.** A save respecced to Customer
  Management 1 + Sales Ability 2 lists only `QuestSkill1 BargainingSkill1 BargainingSkill2` in each, so Sales Ability = BargainingSkill.
- Side quests (Carpenter1–6, Contract1) have neither `IsMain` nor `IsRandom`, `GoldFactor = 0` and a fixed `Gold` award
  (e.g. Carpenter5 (0,16,0)). They are paid like main quests (stored award × bonus per coin). Unverified whether the
  bonus applies to them; all are from before Day 34.
- SaveGame5 (UI Day 203, 460 s into the day): `Main7` now has `SubmitData = 202`, still `Gold = (6,0,0)`,
  `GoldFactor = 0`. So the main-quest payout is not stored either.
- Main quests get the Quest Rewards bonus, **applied per coin component and rounded to a whole coin**. Main7 stores
  `Gold = (6,0,0)`. Its card shows 8 gold at +28% and 6 gold at +0%. The UI Day 203 ledger, where Main7 was the only quest,
  shows Quest Rewards **8 gold = 800,000c**, not 768,000. Rule used: `(round(g×B), round(s×B), round(c×B))`. Round vs
  ceil is undetermined: 7.68 → 8 either way.
- Day 200 ledger fully reproduced from the day-202 save: shop + orders 10,783,947c; purchasing 7,747,220c, after adding
  FlaxSeed/LavenderSeed/ChamomileSeed/RedcurrantSeed/PortalSigil prices; Earnings 11,244,207 (at +0%); Profit 3,496,987.
- Display quirk: every amount shown splits as copper = total mod 5000, with the rest in silver/gold
  (589,133 → 5g 85s 4,133c; 195,538 → 195s 538c).
- The board shows rewards as unnormalised IntVectors (450s 3,471c; 10g 20s 2,612c).
- Quest Rewards bonus = 1 + Customer Management skills (QuestSkill1–4 = +6%, +6%, +8%, +8%, as shown in the in-game
  skill tree). The save lists unlocked skills by name in `UnlockedSkillPointsList` (QuestSkill1–4 present), grouped by
  kind, not in unlock order, and with no dates. `DailyIngredients` stores only `ProfitCoef` per day. So past days'
  quest bonus is **not recoverable**; Customer Management can also be **respecced** (levels removed and re-added, even
  within a day). So the bonus at the moment of a past submission is unknowable from any single save. The save only
  shows the level at save time.
- PocketWatch's only sale (Day 133: 29 for 2000c each) is *below* the 2480 fitted quest price. Bonuses can only raise a shop price,
  so a jewelry-bonus change can't explain it. Unresolved (price rebalance? special sale?).
- Main quests: Main7 stores `Gold = (6,0,0)` but the board shows 8 gold. Unconfirmed: whether 6 × 1.28 = 7.68 is
  rounded for display, and what the ledger books.

### Bonus skills and licenses (investigated 2026-10-29, fixture `SaveGame3.sav`)
The shop, category and order bonuses are **skills**. The save keeps the levels owned now, never when they were bought.
- They live in the second skill-name list (above, "Skill state"): a raw u32-count FName array (66 entries in the fixture),
  not a tagged property, right after the last `NPCQueueData` entries. Find it by searching for `GeneralGoodsProfit2`.
  Names: `GeneralGoodsProfit1–5` (Sundries), `PotionProfit1–5`, `LiquidProfit1–3` (Beverage), `JewelProfit1–2`,
  `RelicProfit1–3`, `StoreProfit1–2` (Shop Profit), `ContractProfit1–3` (**Order Income**). The list also holds
  `QuestSkill1–4`, `BargainingSkill1–4` and machine skills. `UnlockedSkillPointsList` (122 entries) has none of the
  `*Profit` skills.
- Core verifies 23 profit-skill names in fixture block 0 as complete length-prefixed ASCII FStrings; a scan
  matching `(GeneralGoods|Potion|Liquid|Jewel|Relic|Store|Contract)Profit\d+` reads them without walking the list.
- Category level n gives 110/124/140/158/180% (n = 1–5). The Day 199 levels (Sundries 5, Potion 5, Beverage 3,
  Jewelry 2, Relic 3) reproduce every category bonus inferred from prices; `StoreProfit` 2 matches `ProfitCoef` 1.2.
  `ContractProfit` is at level 3 (fixture). Its pay bonus per level is 8/18/30/44/60% (levels 1-5); see §10, "Order prices".
  `SupplierLicense<n>` and `ContractProfit<n>` are the same rank: the license unlocks the improvement
  (the game's `DT_Improvements` table, as published in [TobyTicehurst/alchemy-factory-data](https://github.com/TobyTicehurst/alchemy-factory-data)).
- **No upgrade date is stored**: nothing day-like and no ~199-long array sits near the skill, unlock or reputation data.
  Only the list's tail is in unlock order (`… RelicProfit3, FertilizeEfficiency13, ContractProfit3, PotionProfit5`);
  its first ~20 entries are scrambled, probably by a respec (unverified).
- `UnlockedLicenseList` (UnlockData, 24 names: `GeneralGoodsLicense1–5`, `ApothecaryLicense1–5`, `TavernLicense1–3`,
  `JewelleryLicense1–2`, `RelicTradingWarrant1–3`, `AlchemistLicense1–2`, `SupplierLicense1–3`, `MintingLicense1`) is
  in unlock order, without dates. Each category's Nth license falls in the same order as its Nth price-inferred bonus
  step (e.g. Relic 2 and 3 on Days 127 and 136), so it orders upgrades but cannot date them.
- Order prices step up with Order Income: Bandage 240 → 280c (Days 101–102) → 300c (Days 158–159), Gloom Spores
  380 → 420 → 460c, Pocket Watch 1500 → 1650c (Days 158–159). The second list's tail puts `ContractProfit3` between
  Relic 3 (Day 136) and Potion 5 (Day 159), which fits the Day 158 step. Inference only.
- Also in UnlockData: `UnlockedContractList` = Bandage, GloomSpores, PocketWatch, Catalyst2 (first-order order),
  `UnlockedSupplyOrderList`, `UnlockedManualList`. PlayerData: `PlayerLevel` 6, `YesterdayLevel` 6, `DynamicReputation`
  0.0. LoreData: `CurrentExp` 4223.13, `LoreLevel` 31. Unresolved: `UnlockedSkillPointsList` lists `Level1–7` at
  `PlayerLevel` 6.
- So past days' bonus changes are dated only by prices: categories by the first sale at the new price (unknown on a
  day Shop Profit changed), Order Income by the first order at the new price.

### Loans (LoanSystem.Loans)
Key, AcceptDay, LoanDay, Cost, DayCost, DayRateCost, AllRateCost, CostRate, UnlockLevel.

## 5. Day numbering
Everything in the save is 0-based: header `Day`, `GameDays`, quest `AcceptDate`/`SubmitData`,
DailyIngredients index. The game UI is 1-based. When the UI says "Day 200", the save has
`GameDays = 199`, DailyIngredients holds 199 completed days (UI Days 1–199), and
IngredientCounts holds UI Day 200 so far.

## 6. Verification record (Day 199 = DailyIngredients[198], SaveGame3.sav)
- Shop Income: all 27 items match screenshot counts and amounts. Copper items total 1,261,045c;
  silver items Mars 6/2,688s, Saturn 8/1,920s, Jupiter 11/528s.
- Order Income: Catalyst2 880/3,432s, GloomSpores 3,950/1,817s, Bandage 2,000/600s (= 5,849s).
- Purchasing Cost counts match RestockCount for all 10 items (GelatinousGridlock 14,004,
  RottenLog 270, SageSeed 5,414, Limestone 479, CoalOre 243, RockSalt 108, Pyrite 58, Wood 196,
  IronOre 62, CashRegister 1). Amounts are not stored.
- Quest Rewards (590s + 5,529c) not stored. Two quests had SubmitData = 198.

Internal name ↔ in-game icon examples: VitalityPotion = yellow potion, GrowthPotion = orange,
ManaPotion = blue, HealingPotion = green, StrangeTide = blue mug, WhisperingFields = yellow mug,
GelatinousGridlock = teal slime, SageSeed = seed bag, Mars/Saturn/Jupiter = triangular sigils.

## 7. Decoder notes (`kdec`)
`powzix/ooz` builds with GCC (Linux) and mingw-w64 (Windows cross-compile from WSL) using a
replacement `stdafx.h`:
- Replace `<Windows.h>`, `<tchar.h>`, `<intrin.h>` with `<stdint.h>` and `<x86intrin.h>`.
- Shim `_BitScanReverse/_BitScanForward` (via `__builtin_clz/ctz`, overloads for `unsigned long*`,
  `uint32*`, `int*`), `_rotl`, `_byteswap_ushort/ulong/uint64` (`__builtin_bswap*`), `__forceinline`.
- `packages/core/native/ooz/stdafx.h` maps the intrinsics to `kdec_*` functions with `#define`s placed after
  all system headers, so mingw's own `_rotl`/`_byteswap_*` declarations never clash.
- Keep `kraken.cpp` up to the end of `Kraken_Decompress`; stub `LZNA_DecodeQuantum`,
  `LZNA_InitLookup`, `BitknitState_Init`, `Bitknit_Decode` (not used by these saves).
- Linux build (proven): `g++ -O2 -msse4.1 -w -fpermissive`.
- Windows build (verified 2026-10-25, byte-identical to Linux via WSL interop): `x86_64-w64-mingw32-g++ -O2 -msse4.1 -w -fpermissive -static -Wl,--no-insert-timestamp`, run from `native/` with
  relative source paths so the output is reproducible (kraken.cpp's `__FILE__` would embed an absolute path).
  On Windows set stdout to binary mode (`_setmode(_fileno(stdout), _O_BINARY)`) or the output
  gets corrupted by newline translation.
- Call `Kraken_Decompress(src + offset, compressedSize, dst, uncompressedSize)` per block;
  allocate `uncompressedSize + 64` (decoder may write slightly past the end).
- CLI contract: `kdec <in.sav|-> <offset> <compressedSize> <uncompressedSize>` → raw bytes on stdout;
  `-` reads from stdin.
- Source: powzix/ooz @ 05038060aa68f9187ae9923b2388ca8db40e58d1, GPL-3.0.
Block 0 (562 KB → 58.7 MB) decodes in well under a second.

## 8. No Oodle DLL in the game (verified 2026-10-25)
Alchemy Factory (Steam install, game 1.4.1 build 5024) ships
no `oo2core_*_win64.dll`: a recursive search of the install finds none. Oodle is statically linked into
`AlchemyFactory/Binaries/Win64/AlchemyFactory-Win64-Shipping.exe` (the string `OodleLZ_Decompress` occurs
inside it). The planned `oodle-dll` decoder was therefore dropped; `kdec` is the only decoder.

## 9. Game data: item display names (2026-10-26)
Reference scripts use `AF_GAME_DIR` from the environment or repo `.env` (set by `af-ledger bootstrap`).
The save uses internal item IDs (`Catalyst2`). Their English names come from the game install, which is read-only
and outside the saves folder (`<Steam>/steamapps/common/Alchemy Factory/AlchemyFactory/Content/Paks/`). Both
containers are **unencrypted** and Oodle-compressed (method name `Oodle`); `kdec` decodes their blocks.
- `AlchemyFactory-Windows.utoc/.ucas` (IoStore v8, 64 KiB blocks, 9,217 files) holds the cooked assets:
  - **`Content/DataTables/DT_Enemies`** is the *item* table. The game began as a belt tower-defence ("BeltTD"), so items
    are "enemies". There are 179 rows, and each row's display-name FText references string table `ST_Localization_Names`,
    key `Ingredient_Name_<X>`. X is often, but not always, the ID: `Catalyst2` → `Ingredient_Name_FertileCatalyst`.
  - `ST_Localization_Names`' source strings are **Chinese** (the source language).
- `AlchemyFactory-Windows.pak` (v12) holds the loose files, including `Content/Localization/Game/<culture>/Game.locres`
  (locres v3, Oodle-compressed). The English one maps those keys to names: `Ingredient_Name_FertileCatalyst` → "Fertile Catalyst".
- Result: `config/item-names.json` (179 items; scripts in `reference/game-data/`).
  - Notable names: ManaPotion = "Transformation Potion", Wood = "Logs", WoodBoard = "Plank", Diamond1 = "Adamant",
    InvisbilityPotion = "Floating Potion", Mors = "Oblivion Essence".
  - CashRegister is a building, not an item, so it is absent.
- Other tables there that may help later: `DT_Quests`, `DT_SkillPoints` (skill → bonus values), `DT_SupplyContract`,
  `DT_Buildings`; `DataTables/CustomerCurves/CV_NormalPurchase`/`CV_MerchantPurchase` (maybe shop demand).

## 10. Game data: item prices in `DT_Enemies` (decoded 2026-10-27)
`af-ledger refresh-game-data` (Node, `packages/core/src/gamedata/`) writes `config/game-items.json`.
- The row struct is C++ `FBeltTDEnemyConfig` (no struct asset). Property names, types and order come from the exe's
  reflection tables (Z_Construct property params sorted by offset). Rows use **unversioned property serialization**:
  `FName` row name, `u16` fragment header `0x3d80` (30 properties, has zero mask), `u32` zero mask (bit set = property
  is zero/default and not stored), then the stored properties in index order. A stored bool takes 1 byte (its value).
  178/179 rows consume exactly their bytes; `DriedClay` (placeholder, id 9999) doesn't and is skipped.
- Fields (idx): 0 ID, 1 DisplayName (FText → `Ingredient_Name_X`), 2 DisplayIcon, 3 SolidMesh, 4 ShowColor,
  5 IngredientTags, 6 bHideInGame, 7 MaximumStack, **8 StockCost** (IntVector), **9 SellType** (enum), **10 CostValue**
  (IntVector), 11–13 Heat/Nutrient values, 14 IsLiquid, 15 SellCanStack, 16 RandomQuestBaseNum, 17 NpcShoppingBaseNum,
  18–19 BulkMesh arrays, 20 DescRowName, 21 AllowPortalSupply, 22–25 BaseCost/CauldronCost/CauldronTarget/CauldronMulti
  (doubles, recipe figures, not prices), **26 QuestCost** (int32 copper), 27 QuestTier, 28 ShoppingTier, 29 bHideInCreative.
  IntVectors are (gold, silver, copper): Saturn's CostValue is (0,150,0) = 150,000c.
- **CostValue = shop sell base** (only meaningful when SellType ≠ 0). All 275 shop sales of UI Days 199–208 match
  floor(base × (ProfitCoef + CategoryBonus − 1)) exactly. CostValue is also set on non-shop items (Wood 200).
- **SellType = shop category:** 0 not sold, 1 Sundries, 2 Jewelry, 3 Potion, 4 Relic, 6 Beverage (5 unused). Matches
  the in-game category screen for every item; the old guess of Diamond1 as Jewelry was wrong (SellType 0).
- **QuestCost = quest value per unit**, used by random-quest payouts. Reproduces every known payout to ≤5c (Days 181,
  199, 200, 208; board quests 358, 371). It differs from CostValue for some items (Salt 130 vs 100, Catalyst1 1340 vs
  640, Catalyst2 4222 vs 2221, Diamond2 100,536 vs 100,000, Mars 280,350 vs 280,000). 12 rows have none (Aloe,
  AloePaste, AloeSeed, Ceramics, DriedClay, FireBrick, Granite, Limewater, LinseedOil, Pottery, Salve, WoodAcid).
- **StockCost = purchase (restock) price.** Matches every entry of the old `config/prices.json`, CashRegister (a
  building row) included. Purchasable items have AllowPortalSupply set.
- Random-quest eligibility is RandomQuestBaseNum > 0 (the base count; Salt 160, and Bulk asks 2×). NPC shopping is
  NpcShoppingBaseNum > 0, the same set as SellType ≠ 0 (55 items). Quest-only items: Catalyst1–4, IronIngot, Stone,
  WoodBoard.
- Staleness: `_source.files` stamps the `.utoc` and `.ucas` (name, size, mtime); `af-ledger doctor` warns when the
  installed files differ. The refresh refuses if any other container (not `global.utoc`) also holds
  `DataTables/DT_Enemies.uasset` (patch containers aren't merged yet). Runtime code reads only the committed JSON.
- **Order prices** (found 2026-11-03 from the game's `DT_SupplyContract` table, as published in
  [TobyTicehurst/alchemy-factory-data](https://github.com/TobyTicehurst/alchemy-factory-data)). The save stores no per-item order
  price. Each order contract (`DT_SupplyContract`) pays `ContractReward` for `SellItem.Count` items:
  unit price = floor to whole silver (`ContractReward` × (1 + pay%)) ÷ items per contract, with pay% = 0, 8, 18, 30, 44, 60
  at supplier rank 0-5 (`SupplierLicense<n>` = `ContractProfit<n>`). Contracts: Bandage 12s per 50, Gloom Spores 18s per
  50, Pocket Watch 26s per 20, Fertile Catalyst 60s per 20, Silver Amulet 340s per 10, Moonlit Soap 60g per 10.
  Example: Gloom Spores at rank 1 is floor(19.44s) = 19s ÷ 50 = 380c. The rule matches all 13 price levels in
  `SaveGame3.sav` (Days 40-199; Bandage 240/280/300c, Gloom Spores 380/420/460c, Pocket Watch 1500/1650c, Fertile
  Catalyst 3900c). Days 101 and 158 show mixed averages because the rank changed during the day. The later units noted
  earlier (Bandage 340, Catalyst2 4300, GloomSpores 500) fit rank 4. Not needed for the ledger itself, since
  `DispatchProfit` is stored per day.


## 11. Game data: item icons (extracted 2026-10-28)

`af-ledger refresh-icons` (Node, `packages/core/src/gamedata/`) writes
`assets/icons/<ItemID>.png` (64×64 by default) plus `index.json`. Each item entry has `file`, `texturePath`,
`sourceWidth`, `sourceHeight`; `_source` stamps the same containers, asset, row count and skipped rows as
`game-items.json`. Shared textures are extracted once; partially parsed rows can still supply DisplayIcon.
Scaling uses a premultiplied-alpha area average to avoid white fringes; PNG encoding uses adaptive row filters
and zlib level 9. `npm run refresh:game-data` runs both refresh commands; `doctor` checks icon staleness too.

All 180 `DT_Enemies` rows (the 179 items plus `DriedClay`) resolve; the 24 `bHideInGame` rows have icons too.
- DisplayIcon (field 2) is an `i32` FPackageIndex; negative = import `-v-1`. Each zen import-map entry is a `u64`
  FPackageObjectId; for a package import (top 2 bits = 2), bits 32–61 index the imported-package-names list and the low
  32 bits the public-export hashes. Zen header summary offsets: ImportMapOffset at byte 28, ImportedPackageNamesOffset
  at byte 48.
- The imported-package-names list is a name batch (same layout as the name map) holding full package names such as
  `/Game/Arts/UI/Ingredients/T_UI_ManaPotion`, so no CityHash package-ID lookup is needed: `/Game/X` →
  toc path `AlchemyFactory/Content/X.uasset`.
- Every item icon is `/Game/Arts/UI/Ingredients/T_UI_*`: one Texture2D export per package, mips inline (no `.ubulk`),
  all `PF_B8G8R8A8` uncompressed. 170 are 512×512 (10 mips), 10 are 128×128 (AquaVitae, Brandy, FruitWine,
  LavenderEssentialOil, Limewater, LinseedOil, Mercury, SaltWater, SulfuricAcid, WoodAcid).
- Export data: unversioned properties, then SizeX, SizeY, PackedData (`u32`), pixel format FString,
  FirstMipToSerialize, NumMips (`u32`); each mip is `u32` index, raw BGRA bytes, SizeX/SizeY/SizeZ `u32`, short
  trailer. Mip 0 is the largest. Transparent pixels are stored white with alpha 0.
- 167 distinct textures cover 180 rows: variants share one (CopperPowder/2, GoldDust/2–5, SilverPowder/2–3,
  Sand2–8 → `T_UI_RefinedSand`). Texture names don't always match IDs (AdPortalSigil → `T_UI_GrandPortalSigil`,
  AdvancedFertilizer → `T_UI_AdFertilizerSack`), so map through DisplayIcon, never by name.
- The art belongs to the game. Decision (2026-10-28): bundle them scaled to 64×64 in `assets/icons/`, as YAAFC does.
  The full-size textures are not committed.

## 12. What the save can't tell you

Check this list before proposing a feature or check that depends on save data.
- **Causes.** The save records outcomes per day (shop sales, orders, purchases), not why they changed. Whether a drop
  is shopper behavior or a supply problem, or why purchases spiked, is checked in game. The site only points at
  things.
- **Quest rewards** are not stored, and past quest totals are recalculated with the current bonus (§4, Quests).
- **Wallet header fields** are inventory coins, not business money (§1.1). Never use them in calculations.
- **When a bonus was bought.** The save keeps the bonus skills owned now, not their dates (§4, "Bonus skills and
  licenses"). Only Shop Profit is stored per day (`ProfitCoef`); other changes are dated by prices.
- **Slot folder names** are `<save name>_<YYMMDD><4 digits>`, e.g. `1 Point Oh_2609135133`. The first six digits are
  the date the slot was created (checked against three slots, 2026-10-27). The last four are unverified (possibly time
  of day). The number is not a Steam account ID.
