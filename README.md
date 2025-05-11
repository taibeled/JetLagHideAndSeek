# Jet Lag The Game: Hide and Seek Map Generator
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-1-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

A tool to trivially generate interactive maps for viewing hiding possibilities in Jet Lag The Game's Hide and Seek. So far, the following questions have been implemented (see https://github.com/taibeled/JetLagHideAndSeek/issues/9 for more):

- Radius
    - All
- Thermometer
    - All
- Matching
    - Same occupance of custom zone
    - Same nearest of custom points
    - Same zone (i.e., same region or prefecture)
    - Same first letter of zone
    - Same nearest commercial airport
    - Same train line
    - Same nearest major city
    - Same length of station's name
    - Same first letter of train station name
    - Same nearest park
    - Same nearest amusement park
    - Same nearest zoo
    - Same nearest aquarium
    - Same nearest golf course
    - Same nearest museum
    - Same nearest movie theater
    - Same nearest hospital
    - Same nearest library
    - Same nearest foreign consulate
- Measuring
    - Distance to custom points/line/polygon
    - Distance to coastline
    - Distance to commercial airport
    - Distance to major city
    - Distance to high-speed rail
    - Distance to rail station
    - Distance to 7-Eleven
    - Distance to McDonald's
    - Distance to park
    - Distance to amusement park
    - Distance to zoo
    - Distance to aquarium
    - Distance to golf course
    - Distance to museum
    - Distance to movie theater
    - Distance to hospital
    - Distance to library
    - Distance to foreign consulate
- Tentacles
    - Custom locations
    - Zoo
    - Aquarium
    - Amusement Park
    - Museum
    - Hospital
    - Movie theater
    - Library

## Contributing

This project has evolved significantly, encompassing over 10,000 lines of code. Many intricate features have been developed, so therefore contributions are very much welcome. If you find a bug, please either file an issue or create a pull request. Furthermore, enhancements/feature requests are necessary to keep developing this project, so developments of those would also be appreciated. Here is a list of some suggestions for those wanting to help develop this tool:

- [ ] Adding more questions (https://github.com/taibeled/JetLagHideAndSeek/issues/9, https://github.com/taibeled/JetLagHideAndSeek/issues/32, https://github.com/taibeled/JetLagHideAndSeek/issues/34)
- [ ] Refactoring code
- [ ] Tests (https://github.com/taibeled/JetLagHideAndSeek/issues/36)
- [ ] Custom question presets (https://github.com/taibeled/JetLagHideAndSeek/issues/95)
- [ ] Enable/disable specific bus/train routes (https://github.com/taibeled/JetLagHideAndSeek/issues/65)
- [ ] Manually define bus/train routes (https://github.com/taibeled/JetLagHideAndSeek/issues/61)
- [ ] Copy coordinates of right-clicked point on map (https://github.com/taibeled/JetLagHideAndSeek/issues/94)

Even if you're not a programmer, you can still help by further documenting the unknown questions.

## Developer Workflow

To develop this website, you need to have [git](https://git-scm.com/downloads) and [pnpm](https://pnpm.io/installation) installed. You should then start by cloning this repository and entering the directory:

```bash
git clone https://github.com/taibeled/JetLagHideAndSeek.git
cd JetLagHideAndSeek
```

Next, use `pnpm` to install the dependencies:

```bash
pnpm install
```

You can now host the website as you make modifications:

```bash
pnpm dev
```

After making any modifications, please run `pnpm lint` to have your code automatically formatted and errors spotted.

## Contributors

A great deal of appreciation goes out to these individuals who have helped to create this tool:
<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/vdumestre"><img src="https://avatars.githubusercontent.com/u/33914769?v=4?s=100" width="100px;" alt="vdumestre"/><br /><sub><b>vdumestre</b></sub></a><br /><a href="#ideas-vdumestre" title="Ideas, Planning, & Feedback">🤔</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->
