# Jet Lag The Game: Hide and Seek Map Generator

A tool to trivially generate interactive maps for viewing hiding possibilities in Jet Lag The Game's Hide and Seek. So far, the following questions have been implemented (see https://github.com/taibeled/JetLagHideAndSeek/issues/9 for more):

- Radius
  - All
- Thermometer
  - All
- Matching
  - Same zone (i.e., same region or prefecture)
  - Zone that starts with the same letter
  - Same closest commercial airport
  - Same train line
  - Same closest major city
  - Same length of station's name
  - Same first letter of train station name
- Measuring
  - Coastline
  - Commercial airports
  - Major city
  - Rail station
  - 7-Eleven
  - McDonald's
- Tentacles
  - Zoo
  - Aquarium
  - Amusement Park
  - Museum
  - Hospital
  - Movie theater
  - Library

## Contributing

If anyone wants to help, please focus on one of the following or leave an issue with your request:

- [x] User interface
- [x] Custom map bounds (i.e. draw geoJSON which should be used for the bounds)
- [ ] Adding questions (https://github.com/taibeled/JetLagHideAndSeek/issues/9)
- [ ] Refactoring code
- [x] Hider menu (prevent conflicting information between hiders and seekers by adding a menu for hiders to automatically obtain answers)
- [x] Train station fetching (use Overpass to fetch train stations in the zone and automatically show them, https://github.com/taibeled/JetLagHideAndSeek/issues/24)
- [x] Progressive web app (https://github.com/taibeled/JetLagHideAndSeek/issues/1)

This project uses ESLint and Prettier for formatting/style. Before submitting a pull request/committing, please run `pnpm lint` for your code to be automatically fixed.

More documentation to come.

Note that only questions that are shown in the show will be used, for now. I do not want to "reveal" anything exclusive to The Home Game or take away from its success in any way.
