# Changelog

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
