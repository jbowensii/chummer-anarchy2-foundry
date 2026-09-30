# Changelog

## 0.1.0

First release: import runners from Chummer Anarchy 2.0 into Shadowrun Anarchy 2 (sra2 14.3.3, Foundry 14).

- GM-only "Import from Chummer" button in the Actors sidebar. The file is checked before anything in the world changes, and a file that can't be used says why.
- Runners come in with attributes, skills and specializations, metatype caps, amps as feats (Risk Reduction, wound boxes, thresholds, narrative effects), weapons, armor, gear, nuyen, keywords, behaviors, catchphrases, background, notes and portrait.
- Vehicles and drones become linked vehicle actors.
- A runner already in the world can be replaced in place (play state kept), added as a new version, or skipped. A file older than the world copy defaults to Skip.
- Anything sra2 has no field for is kept as text in the runner's notes, and the import report lists it.
- In-Foundry tests with Quench.
