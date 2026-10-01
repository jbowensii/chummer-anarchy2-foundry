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

1. As the GM, open the Actors sidebar and click **Import from Chummer** (players don't see the button).
2. Choose the file. The module checks it before anything in your world changes; a file it can't use says why.
3. Untick any runner you don't want, pick what to do with runners already in the world, and click **Import**.

Imported runners go in the Actors folder "Chummer Anarchy", each runner's vehicles in a subfolder. The report at the end lists anything that was turned into text.

### A runner that's already in the world

- **Replace** (the default when the file is newer or the same): the actor is updated in place. It keeps its id, folder, ownership, token settings (including a token image you set; a token that shows the actor's portrait follows a new one), wounds and other play state, items you added yourself, links to your own vehicles, and a dated name if it was added as a new version. Its sheet data and the items that came from Chummer are rebuilt from the file; its vehicles are updated too, keeping their control mode.
- **Add as new version**: a second actor named with the export date, for example "Mara (2 Oct 2026)". The old one is untouched.
- **Skip**: nothing changes. This is chosen for you when the file is older than the copy in your world.

"Apply to all" sets the same choice on every row; with Skip it also unticks runners that are new to the world.

## Book data

The GM can bring the catalogues of the books they own into Foundry as compendiums.

### Export from Chummer

In Chummer, choose **Game data → Export book data for Foundry** (GMs only). For your own Foundry only. Don’t share this file.

### Import into Foundry

Open **Import from Chummer**, choose the book-data file, untick any book you don't want, and click **Import**. Each book gets its own folder, "<book name> (<book id>)", inside the Compendium folder "Chummer Anarchy", with a compendium for each kind of entry the book has:

- **Amps**: qualities, cyberware and the other amps as sra2 feats, with Risk Reduction, wound boxes and thresholds. An equipment amp that is a weapon or armor becomes that feat type.
- **Weapons**, **Armor**, **Gear** and **Spells**: feats of that type (weapon damage and ranges, armor value).
- **Vehicles**: custom vehicle actors.
- **Skills & specializations**: only the skills and specializations sra2 doesn't already have; sra2's own are not duplicated.
- **Rules**: one journal per rules section, one page per rule, sorted by page. Without descriptions a page says where to read it ("See MUC p.50").

Every item and vehicle carries its book and page in its reference field; rules carry theirs in their flags. Your table rules from Chummer, if the file has any, go in the compendium "Table rules — Chummer" in the "Chummer Anarchy" folder.

### Importing a book again

A re-import replaces the entries that came from the file, keeping their ids so links to them keep working. In a rules or table-rules journal, the imported pages are rebuilt from the file and pages you added are kept. Entries missing from the file are never deleted: entries you made yourself, and older entries the new file no longer has, stay as they are. A rules section renamed in Chummer arrives as a new journal; the journal with the old name stays until you delete it.

## Not imported yet, or imported differently

- Vehicle-template amps (book data) stay feats for now, with a note; they are not turned into vehicles.
- Vehicle damage thresholds, contact names, and a cyberdeck's firewall and attack.
- Knowledge and languages, Edge, and lifestyle: kept in the actor's notes.
- Armor bonuses from amps: the runner's armor comes from armor items only. sra2 adds up every active armor item, so only one worn chain is active, as Chummer counts it: an armor item plus what it is worn over. The chain with the highest total stays active (the first on a tie); every other armor item is imported inactive.
- Extra drones of the same kind: the count is in the vehicle's description; sra2's additional drone count is not set.
- A runner without a portrait gets Foundry's default artwork.

## Sharing

For your own Foundry only. Don’t share the export file. A file exported with descriptions includes the text of amps and gear; share it only with people who own the books.

## Tests

`npm install && npm test` runs the unit tests (Vitest).

### Tests in Foundry

1. Install and enable [Quench](https://github.com/Ethaks/FVTT-Quench) in an sra2 world alongside this module.
2. Open the Quench test runner.
3. Tick the "Chummer Importer" batches and run them.

The batches import `samples/test-export.json` (a made-up file with no book text) into a throwaway Actors folder, "Chummer Importer tests", and `samples/test-books.json` (a made-up book file) into compendiums named `ca2test-…` in a Compendium folder of the same name. They delete what they made when they finish and don't touch anything else in the world.

## License

MIT
