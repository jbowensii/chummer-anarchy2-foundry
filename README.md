# Chummer Anarchy 2.0 Importer

A Foundry VTT module that imports runners and book data exported from [Chummer Anarchy 2.0](https://github.com/jbowensii/chummer-anarchy2) into the Shadowrun Anarchy 2 (`sra2`) system.

Tested with sra2 14.3.3 on Foundry 14.

## Install

In Foundry, go to Add-on Modules, choose Install Module, and paste the manifest URL:

```
https://github.com/jbowensii/chummer-anarchy2-foundry/releases/latest/download/module.json
```

Then enable "Chummer Anarchy 2.0 Importer" in your sra2 world.

## Export from Chummer

- One runner: in the runner editor, choose **Export for Foundry**.
- Several runners: in the runner list, choose **Export for Foundry…** and tick the runners you want.

You get a file ending in `.ca2foundry.json`.

## Import into Foundry

1. As the GM, open the Actors sidebar (or the Compendium sidebar) and click **Import from Chummer** at the bottom (players don't see the button).
2. Choose the file. The module checks it before anything in your world changes; a file it can't use says why. A Chummer Shadowrun 6 file is refused with a pointer to the Chummer SR6 Importer (for shadowrun6-eden worlds).
3. Untick any runner you don't want, pick what to do with runners already in the world, and click **Import**.

Imported runners go in the Actors folder "Chummer Anarchy", each runner's vehicles in a subfolder. The report at the end lists anything that was turned into text.

### A runner that's already in the world

- **Replace** (the default when the file is newer or the same): the actor is updated in place. It keeps its id, folder, ownership, token settings (including a token image you set; a token that shows an imported portrait, token image or icon follows the new one), wounds and other play state, items you added yourself, links to your own vehicles, and a dated name if it was added as a new version. Its sheet data and the items that came from Chummer are rebuilt from the file; its vehicles are updated too, keeping their control mode.
- **Add as new version**: a second actor named with the export date, for example "Mara (2 Oct 2026)". The old one is untouched.
- **Skip**: nothing changes. This is chosen for you when the file is older than the copy in your world.

"Apply to all" sets the same choice on every row; with Skip it also unticks runners that are new to the world.

## NPCs, critters and spirits

Chummer 0.7.0 lets GMs make NPCs, critters and spirits and export them for Foundry like runners (the same kind of file). They import as sra2 characters, since sra2 has no NPC actor type:

- Into the Actors folder "Chummer NPCs" (runners keep going into "Chummer Anarchy"). Replace, Add as new version and Skip work as for runners; the import window marks each NPC row with its kind and tier.
- The GM-only facts go in the actor's **GM description** (shown on the sheet to the GM in sra2's advanced mode): kind, tier (prime or regular), fighting spirit with what it means, and for a regular NPC the average hits of each dice pool, written like the book: "Ranged Weapons 5 (5+A, RR 1)" (round(dice pool / 3) + Risk Reduction + 1; skill rating + attribute initial).
- Tokens are hostile. A prime NPC's token is linked to its actor, like a runner's; a regular NPC's is not, so each copy on the map takes its own damage.
- A critter or spirit without a metatype gets no metatype item.
- An NPC without a portrait gets the module's NPC, critter or spirit icon as its image and token.

A book's NPCs, critters and spirits go in its compendium **NPCs & Critters** (see Book data).

## Book data

The GM can bring the catalogues of the books they own into Foundry as compendiums.

### Export from Chummer

In Chummer, choose **Game data → Export book data for Foundry** (GMs only). For your own Foundry only. Don’t share this file.

### Import into Foundry

In the Compendium sidebar (or the Actors sidebar), click **Import from Chummer**, choose the book-data file, untick any book you don't want, and click **Import**. Each book gets its own folder, "<book name> (<book id>)", inside the Compendium folder "Chummer Anarchy", with a compendium for each kind of entry the book has:

- **Amps**: qualities, cyberware and the other amps as sra2 feats, with Risk Reduction, wound boxes and thresholds. An equipment amp that is a weapon or armor becomes that feat type.
- **Weapons**, **Armor**, **Gear** and **Spells**: feats of that type (weapon damage and ranges, armor value).
- **Vehicles**: custom vehicle actors.
- **Characters**: the book's pregenerated characters, each with its linked token, and their vehicles as separate entries named "<runner> — <vehicle>".
- **NPCs & Critters**: the book's NPCs, critters and spirits, as above (Chummer 0.7.0's export).
- **Metatypes**: the book's metatypes, with attribute caps, Anarchy bonus, edge and racial quality.
- **Skills & specializations**: every skill and specialization in the file, using the same slugs as sra2's own, so they are interchangeable with the system's.
- **Rules**: one journal per topic (rules sheet), with a chapter per section and one page per rule, sorted by page. Without descriptions a page says where to read it ("See MUC p.50").

A compendium is never created empty: a book only gets the compendiums (and its folder) it has entries for.

Chummer 0.6.2's export is needed for the rules topics, metatypes and pregens; older files still import, with the rules sections they had.

Items and vehicles carry their book and page in their reference field (pregens' reference names Chummer); rules carry theirs in their flags. Your table rules from Chummer, if the file has any, go in the compendium "Table rules — Chummer" in the "Chummer Anarchy" folder.

### Importing a book again

Foundry gives every document its own id; the module never sets one. Each entry it imports carries Chummer's key for it in the module's flags: `chummerID` (`<book>:<kind>:<id>` for a book entry, for example `MUC:weapons:muc.made-up-blade`; a pregen's `MUC:character:<id>`) and `chummerAliases` (its keys from earlier Chummer imports, when the file has them). Both are in every compendium's index.

A re-import finds each entry by its `chummerID` (then an alias) and updates it in place, so it keeps its id and links to it keep working; anything new is added. In a rules or table-rules journal, the imported pages are updated in place by their `chummerID` (keeping their ids), and pages the file no longer has and the pages you added are kept.

**Worlds that imported books with 0.7.x or earlier.** Those versions gave each entry an id computed from Chummer's id. A re-import with this version finds such an entry by that id, updates it in place and writes `chummerID` onto it, so nothing is duplicated and links keep working; the import report counts them as migrated.

A runner's or NPC's amps and items from a book are linked to their entries in that book's compendiums in this world (Foundry's compendium source): by `chummerID`, then alias, then the same item type and name inside that one book's compendiums (the same kind, then the same page, breaks a tie). Still more than one: no link, and the import report lists them. Never by name across all compendiums. Entries missing from the file are never deleted: entries you made yourself, and older entries the new file no longer has, stay as they are. A topic renamed in Chummer arrives as a new journal; the journal with the old name stays until you delete it. In Characters, items you added to a pregen are kept. The one-journal-per-section journals from 0.2.x are left alone; you can delete them by hand.

## GM compendiums

A compendium a GM made in Chummer (0.8.0: their own amps, weapons, armor, gear, spells, complex forms, vehicles and NPCs) exports from its Compendiums page as a book-data file with one book, and imports the same way as a book (**Import from Chummer**). The window marks it as a GM's compendium. It goes in its own folder, "<compendium name> (<id>)", inside the Compendium folder **"Chummer compendiums"** (books stay in "Chummer Anarchy"), with the same compendiums a book would get, labelled "(House)", e.g. "Weapons — MYH (House)". Its entries are non-canon, carry the compendium's id as their source, are flagged `compendium`, and have the GM's own descriptions. Importing it again works as for a book: entries from the file are replaced by id, the rest are left alone, and no compendium is made empty.

## Icons

Imported items, skills, specializations, vehicles and metatypes (on runners, in the world and in the book compendiums) get an icon. The icons ship with the module:

- **Defaults** by category and sub-kind: weapons by weapon type, vehicles by the closest sra2 vehicle type, spells by type (a runner's or NPC's too, from the catalog category Chummer exports), skills and specializations by skill group, qualities as positive or negative, bioware, commlinks, SINs, and so on.
- **Specific art** by item name, and optionally for one book's version of an item, wins over the default. More of it is added in module updates.

A picture you pick in Foundry is never replaced, not by Apply icons and not by importing the runner or book again: only empty images, Foundry's and sra2's stock images, the module's own icons and portraits and token images imported from Chummer are.

**Apply icons** (Game Settings → Configure Settings → Chummer Anarchy 2.0 Importer, GM only) re-applies the icons to everything already imported, so it picks up newly shipped art after a module update. Character portraits and tokens are never touched.

Entries imported before 0.4.0 carry no icon information, so they get no icons, from Apply icons either: import the runner or book once more to give them icons.

## Not imported yet, or imported differently

- Vehicle-template amps (book data) stay feats for now, with a note; they are not turned into vehicles.
- Vehicle damage thresholds, contact names, and a cyberdeck's firewall and attack.
- Knowledge and languages, Edge, and lifestyle: kept in the actor's notes.
- Armor bonuses from amps: the runner's armor comes from armor items only. sra2 adds up every active armor item, so only one worn chain is active, as Chummer counts it: an armor item plus what it is worn over. The chain with the highest total stays active (the first on a tie); every other armor item is imported inactive.
- Extra drones of the same kind: the count is in the vehicle's description; sra2's additional drone count is not set.
- A runner without a portrait gets Foundry's default artwork.
- Portrait and token are separate: a runner exported with its own token image gets it on its token; without one the token shows the portrait. A token image you set in Foundry is never replaced.

## Sharing

For your own Foundry only. Don’t share the export file. A file exported with descriptions includes the text of amps and gear; share it only with people who own the books.

## Tests

`npm install && npm test` runs the unit tests (Vitest).

### Tests in Foundry

1. Install and enable [Quench](https://github.com/Ethaks/FVTT-Quench) in an sra2 world alongside this module.
2. Open the Quench test runner.
3. Tick the "Chummer Importer" batches and run them.

The batches import `samples/test-export.json` (a made-up file with no book text) into a throwaway Actors folder, "Chummer Importer tests", `samples/test-npcs.json` (made-up NPCs) into "Chummer NPCs" (that folder is deleted again if the batch made it and it is left empty), `samples/test-books.json` (a made-up book file) into compendiums named `ca2test-…` in a Compendium folder of the same name, and `samples/test-compendium.json` (a made-up GM compendium) into compendiums named `ca2test-ca2-myh-…` in "Chummer compendiums" (that folder is deleted again if the batch made it and it is left empty). They delete what they made when they finish and don't touch anything else in the world.

## License

Code: MIT. Icon art © John Bowens, made for and distributed with this module.
