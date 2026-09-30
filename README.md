# Chummer Anarchy 2.0 Importer

A Foundry VTT module that imports runners exported from [Chummer Anarchy 2.0](https://github.com/jbowensii/chummer-anarchy2) into the Shadowrun Anarchy 2 (`sra2`) system.

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

- **Replace** (the default when the file is newer or the same): the actor is updated in place. It keeps its id, folder, ownership, token settings, wounds and other play state, items you added yourself, links to your own vehicles, and a dated name if it was added as a new version. Its sheet data and the items that came from Chummer are rebuilt from the file; its vehicles are updated too, keeping their control mode.
- **Add as new version**: a second actor named with the export date, for example "Mara (2 Oct 2026)". The old one is untouched.
- **Skip**: nothing changes. This is chosen for you when the file is older than the copy in your world.

"Apply to all" sets the same choice on every row; with Skip it also unticks runners that are new to the world.

## Not imported yet

- Book data (the amps, gear and vehicles catalogues): comes in 0.2.0.
- Vehicle damage thresholds, contact names, and a cyberdeck's firewall and attack.

## Sharing

For your own Foundry only. Don’t share the export file. A file exported with descriptions includes the text of amps and gear; share it only with people who own the books.

## Tests

`npm install && npm test` runs the unit tests (Vitest).

### Tests in Foundry

1. Install and enable [Quench](https://github.com/Ethaks/FVTT-Quench) in an sra2 world alongside this module.
2. Open the Quench test runner.
3. Tick the "Chummer Importer" batches and run them.

The batches import `samples/test-export.json` (a made-up file with no book text) into a throwaway Actors folder, "Chummer Importer tests", and delete it when they finish. They don't touch anything else in the world.

## License

MIT
