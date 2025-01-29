# Jet Lag The Game: Hide and Seek Map Generator

A tool to trivially generate interactive maps for viewing hiding possibilities in Jet Lag The Game's Hide and Seek. So far, the following questions have been implemented:

- [x] Radius
  - [x] All
- [x] Thermometer
  - [x] All
- [ ] Matching
  - [x] Same zone (i.e., same region or prefecture)
- [ ] Measuring
- [x] Tentacles
  - [x] Museum (inferred)
  - [x] Zoo
  - [x] Aquarium
  - [x] Amusement Park
  - [x] Hospital
  - [ ] Metro line (is this stations or line itself?)
  - [ ] More (I only went off the obvious ones from the show, if you have the complete list, please leave an issue)

If anyone wants to help, please focus on one of the following or leave an issue with your request:

- [x] User interface
- [ ] Custom map bounds (i.e. draw geoJSON which should be used for the bounds)
- [ ] Adding questions
- [ ] Refactoring code
- [ ] Train station fetching (use Overpass to fetch train stations in the zone and automatically show them)
- [x] Progressive web app (https://github.com/taibeled/JetLagHideAndSeek/issues/1)
  - [ ] Icon for the app

More documentation to come.

Note that only questions that are shown in the show will be used, for now. I do not want to "reveal" anything exclusive to The Home Game or take away from its success in any way.
