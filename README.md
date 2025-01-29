# Jet Lag The Game: Hide and Seek Map Generator

A tool to trivially generate interactive maps for viewing hiding possibilities in Jet Lag The Game's Hide and Seek. So far, the following questions have been implemented (see https://github.com/taibeled/JetLagHideAndSeek/issues/9 for more):

- [x] Radius
  - [x] All
- [x] Thermometer
  - [x] All
- [ ] Matching
  - [x] Same zone (i.e., same region or prefecture)
- [ ] Measuring
- [x] Tentacles
  - [x] Museum
  - [x] Zoo
  - [x] Aquarium
  - [x] Amusement Park
  - [x] Hospital

## Contributing

If anyone wants to help, please focus on one of the following or leave an issue with your request:

- [x] User interface
- [x] Custom map bounds (i.e. draw geoJSON which should be used for the bounds)
- [ ] Adding questions (https://github.com/taibeled/JetLagHideAndSeek/issues/9)
- [ ] Refactoring code
- [ ] Hider menu (prevent conflicting information between hiders and seekers by adding a menu for hiders to automatically obtain answers)
- [ ] Train station fetching (use Overpass to fetch train stations in the zone and automatically show them)
- [x] Progressive web app (https://github.com/taibeled/JetLagHideAndSeek/issues/1)
  - [ ] Icon for the app

More documentation to come.

Note that only questions that are shown in the show will be used, for now. I do not want to "reveal" anything exclusive to The Home Game or take away from its success in any way.
