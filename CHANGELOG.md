# Changelog

## 0.7.0

- Separate portrait and token: a runner, NPC, pregen or book NPC with its own token image (optional `token` in the export) gets the portrait as its image and the token image on its prototype token. Without one the token shows the portrait, as before. Token images are uploaded to `worlds/<world>/chummer/tokens`.
- Replace and book re-import change a token image only while it shows the module's art (an icon, an imported portrait or token); a token image you chose is never overwritten, in the world or in a compendium.
- Runner and NPC items carry their catalog category (optional `category` in the export): they get the same per-category icon as the same item from a book, e.g. a combat spell's. Name-specific art still wins.
- Export schema updated (optional `runners[].token`, `runners[].items[].category`).
- Tests and In-Foundry tests (Quench) for both.

## 0.6.0

- GM compendiums (Chummer 0.8.0): a book-data file whose book is a GM's compendium (`source.compendium`) imports like a book, into "<name> (<id>)" inside the Compendium folder "Chummer compendiums", with its packs labelled "(House)" and every entry flagged `compendium`. The import window marks it. Re-import replaces by id as for books; no empty compendiums.
- Export schema updated from Chummer (optional `source.compendium`).
- Made-up sample `samples/test-compendium.json`; tests and In-Foundry tests (Quench) for compendiums.

## 0.5.0

- NPCs, critters and spirits (Chummer 0.7.0): they import as sra2 characters (sra2 has no NPC actor type). Kind, tier, fighting spirit and, for a regular NPC, the average hits of each dice pool ("Ranged Weapons 5 (5+A, RR 1)") go in the actor's GM description, which only the GM sees.
- NPC tokens are hostile; a prime NPC's token is linked to its actor, a regular NPC's is not, so each copy on the map has its own wounds.
- A critter or spirit without a metatype gets no metatype item.
- An NPC without a portrait gets the module's NPC, critter or spirit icon as its image and token.
- NPCs from a runners file go in the Actors folder "Chummer NPCs"; Replace, Add as new version and Skip work as for runners. The import window marks NPC rows and counts them.
- Book data: a book's NPCs, critters and spirits go in its new compendium "NPCs & Critters" (only when the book has some).
- In-Foundry tests (Quench) for NPCs.

## 0.4.0

- Icons: imported items, skills, specializations, vehicles and metatypes get the module's icons, a default per category and sub-kind (weapon type, vehicle type, spell type, skill group and so on). Specific art for an item (by name, optionally for one book's version) wins over the default; more ships in module updates.
- New settings menu "Apply icons" (GM): re-applies the icons to the world, runners' items and the Chummer compendiums, e.g. to pick up art a module update adds. Character portraits and tokens are not touched.
- A picture you pick in Foundry is never replaced, by Apply icons or by importing a runner or book again.
- Entries imported before 0.4.0 carry no icon information: import the runner or book once more to give them icons.
- In-Foundry tests (Quench) for icons.

## 0.3.0

- Rules: one journal per topic (rules sheet) with a chapter per section and the rules as pages inside, instead of one journal per section. The old per-section journals from 0.2.x are left alone; delete them by hand if you like.
- New compendium Characters: each book's pregenerated characters with linked tokens; their vehicles are separate entries.
- New compendium Metatypes.
- Skills & specializations now holds every skill and specialization in the file, interchangeable with sra2's own.
- A compendium is never created empty: a book gets only the compendiums (and folder) it has entries for.
- A re-import keeps entries the GM made, GM pages in journals, and items the GM added to a pregen.
- Needs the book export from Chummer 0.6.2 for topics, metatypes and pregens; older files still import.

## 0.2.2

- "Import from Chummer" is also in the Compendium tab (as well as the Actors tab); either opens the same window, for runner and book-data files.
- Fixed: importing a book whose rules have no section (found with the Conversion Guide) failed with "name: may not be undefined". Such rules now go in a journal named after their rules sheet, or "Rules"; a rule without a title uses its id.

## 0.2.1

- Quench: the book-data Risk Reduction check matches the line's type, value and target, since sra2 adds its own fields to each line (the import itself was already right).

## 0.2.0

- Book data: the GM imports a book-data file exported from Chummer (Game data → Export book data for Foundry) into world compendiums, one folder per book inside "Chummer Anarchy": amps, weapons, armor, gear, spells, vehicles, the skills and specializations sra2 doesn't already have, and rules journals (one per section, pages sorted by page).
- Entries keep a stable id from Chummer: a re-import replaces its own entries in place, so links stay. Entries missing from the file are never deleted, and entries the GM made stay. In a journal, imported pages are rebuilt from the file and pages the GM added are kept.
- Every item and vehicle carries its book and page in its reference field (rules carry it in their flags); descriptions only when the file includes them.
- Table rules from Chummer go in the compendium "Table rules — Chummer".
- Vehicle-template amps stay feats for now, with a note.
- In-Foundry tests (Quench) for book data.

## 0.1.1

- Fixed: melee weapons Chummer names in its own words (e.g. "Short weapon") now roll Close Combat; clubs, batons, staffs, maces, hammers and shock weapons come in as sra2 advanced melee.
- Fixed: a weapon sra2 has no type for is linked to Close Combat (defense: Close Combat, Defense) when it is melee-only, otherwise to Ranged Weapons (defense: Athletics, Ranged Defense), instead of always Ranged Weapons.
- Armor: layered armor counts as Chummer counts it. The worn chain (an item plus what it is worn over) with the highest total stays active, the first on a tie; every other armor item is inactive, and the notes say which chain was kept.
- Replace: when the file has a portrait, the token image follows it if the token was showing the actor's image; a token image the GM set stays.

## 0.1.0

First release: import runners from Chummer Anarchy 2.0 into Shadowrun Anarchy 2 (sra2 14.3.3, Foundry 14).

- GM-only "Import from Chummer" button in the Actors sidebar. The file is checked before anything in the world changes, and a file that can't be used says why.
- Runners come in with attributes, skills and specializations, metatype caps, amps as feats (Risk Reduction, wound boxes, thresholds, narrative effects), weapons, armor, gear, nuyen, keywords, behaviors, catchphrases, background, notes and portrait.
- Vehicles and drones become linked vehicle actors.
- A runner already in the world can be replaced in place (play state kept), added as a new version, or skipped. A file older than the world copy defaults to Skip.
- Anything sra2 has no field for is kept as text in the runner's notes, and the import report lists it.
- In-Foundry tests with Quench.
