# Chummer Anarchy 2.0 Importer

A Foundry VTT module that imports runners exported from [Chummer Anarchy 2.0](https://github.com/jbowensii/chummer-anarchy2) into the Shadowrun Anarchy 2 (`sra2`) system.

Tested with sra2 14.3.3 on Foundry 14.

## Install

In Foundry, go to Add-on Modules, choose Install Module, and paste the manifest URL:

```
https://github.com/jbowensii/chummer-anarchy2-foundry/releases/latest/download/module.json
```

## Use

1. In Chummer Anarchy 2.0, open Export and export your runners. You get a file named `runners-YYYY-MM-DD.ca2foundry.json`.
2. In Foundry, as the GM, choose the module's import and pick that file. The module checks the file before anything in your world changes.

Only the GM can import.

## What Replace keeps

When you import a runner that already exists in the world and choose Replace, the actor is updated in place: its id, folder, ownership and token settings stay. The runner's sheet data and owned items are rebuilt from the file.

## Sharing

For your own Foundry only. Don’t share this file. A file exported with descriptions includes the text of amps and gear; share it only with people who own the books.

## Tests

`npm install && npm test` runs the unit tests (Vitest). The module also recommends [Quench](https://github.com/League-of-Foundry-Developers/quench) for in-Foundry tests.

`samples/test-export.json` is a made-up file used by the tests; it contains no book text.

## License

MIT
