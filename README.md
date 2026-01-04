# Jet Lag The Game: Hide and Seek Map Generator

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
- [x] Copy coordinates of right-clicked point on map (https://github.com/taibeled/JetLagHideAndSeek/issues/94)

Even if you're not a programmer, you can still help by further documenting the unknown questions.

## Developer Workflow

To develop this website, you need to have [git](https://git-scm.com/downloads), [Node.js](https://nodejs.org/) (version 24 or earlier), and [pnpm](https://pnpm.io/installation) installed. You should then start by cloning this repository and entering the directory:

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
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/taibeled"><img src="https://avatars.githubusercontent.com/u/179261820?v=4?s=100" width="100px;" alt="taibeled"/><br /><sub><b>taibeled</b></sub></a><br /><a href="https://github.com/taibeled/JetLagHideAndSeek/issues?q=author%3Ataibeled" title="Bug reports">🐛</a> <a href="https://github.com/taibeled/JetLagHideAndSeek/commits?author=taibeled" title="Code">💻</a> <a href="#design-taibeled" title="Design">🎨</a> <a href="https://github.com/taibeled/JetLagHideAndSeek/commits?author=taibeled" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/vdumestre"><img src="https://avatars.githubusercontent.com/u/33914769?v=4?s=100" width="100px;" alt="vdumestre"/><br /><sub><b>vdumestre</b></sub></a><br /><a href="#ideas-vdumestre" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/MrYawnie"><img src="https://avatars.githubusercontent.com/u/14262612?v=4?s=100" width="100px;" alt="Jani Andsten"/><br /><sub><b>Jani Andsten</b></sub></a><br /><a href="https://github.com/taibeled/JetLagHideAndSeek/commits?author=MrYawnie" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://bradleyrosenfeld.com/"><img src="https://avatars.githubusercontent.com/u/938452?v=4?s=100" width="100px;" alt="ʙʀᴀᴅʟᴇʏ ʀᴏsᴇɴғᴇʟᴅ"/><br /><sub><b>ʙʀᴀᴅʟᴇʏ ʀᴏsᴇɴғᴇʟᴅ</b></sub></a><br /><a href="https://github.com/taibeled/JetLagHideAndSeek/commits?author=BoringCode" title="Code">💻</a> <a href="https://github.com/taibeled/JetLagHideAndSeek/issues?q=author%3ABoringCode" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/abrahamguo"><img src="https://avatars.githubusercontent.com/u/7842684?v=4?s=100" width="100px;" alt="Abraham Guo"/><br /><sub><b>Abraham Guo</b></sub></a><br /><a href="https://github.com/taibeled/JetLagHideAndSeek/commits?author=abrahamguo" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://zusor.io/"><img src="https://avatars.githubusercontent.com/u/23165606?v=4?s=100" width="100px;" alt="Tobias Messner"/><br /><sub><b>Tobias Messner</b></sub></a><br /><a href="https://github.com/taibeled/JetLagHideAndSeek/commits?author=zusorio" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/UnknownSilicon"><img src="https://avatars.githubusercontent.com/u/14339279?v=4?s=100" width="100px;" alt="Eris"/><br /><sub><b>Eris</b></sub></a><br /><a href="https://github.com/taibeled/JetLagHideAndSeek/commits?author=UnknownSilicon" title="Code">💻</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/khiral"><img src="https://avatars.githubusercontent.com/u/23667350?v=4?s=100" width="100px;" alt="khiral"/><br /><sub><b>khiral</b></sub></a><br /><a href="https://github.com/taibeled/JetLagHideAndSeek/commits?author=khiral" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/hanneshier"><img src="https://avatars.githubusercontent.com/u/11063798?v=4?s=100" width="100px;" alt="hanneshier"/><br /><sub><b>hanneshier</b></sub></a><br /><a href="#ideas-hanneshier" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/blahajjessie"><img src="https://avatars.githubusercontent.com/u/78718906?v=4?s=100" width="100px;" alt="blahajjessie"/><br /><sub><b>blahajjessie</b></sub></a><br /><a href="#ideas-blahajjessie" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://bagottgames.uk/"><img src="https://avatars.githubusercontent.com/u/88278955?v=4?s=100" width="100px;" alt="Bla0"/><br /><sub><b>Bla0</b></sub></a><br /><a href="#ideas-Blaa00" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://herzog.tech/"><img src="https://avatars.githubusercontent.com/u/5376265?v=4?s=100" width="100px;" alt="Leo"/><br /><sub><b>Leo</b></sub></a><br /><a href="#ideas-leoherzog" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Acclamator"><img src="https://avatars.githubusercontent.com/u/4201849?v=4?s=100" width="100px;" alt="Acclamator"/><br /><sub><b>Acclamator</b></sub></a><br /><a href="#ideas-Acclamator" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/selacey42"><img src="https://avatars.githubusercontent.com/u/200851729?v=4?s=100" width="100px;" alt="selacey42"/><br /><sub><b>selacey42</b></sub></a><br /><a href="#ideas-selacey42" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/taibeled/JetLagHideAndSeek/issues?q=author%3Aselacey42" title="Bug reports">🐛</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/asemaca"><img src="https://avatars.githubusercontent.com/u/64056714?v=4?s=100" width="100px;" alt="asemaca"/><br /><sub><b>asemaca</b></sub></a><br /><a href="#ideas-asemaca" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/taibeled/JetLagHideAndSeek/issues?q=author%3Aasemaca" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Akiva-Cohen"><img src="https://avatars.githubusercontent.com/u/150308530?v=4?s=100" width="100px;" alt="Akiva Cohen"/><br /><sub><b>Akiva Cohen</b></sub></a><br /><a href="#ideas-Akiva-Cohen" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/taibeled/JetLagHideAndSeek/issues?q=author%3AAkiva-Cohen" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ChrisHartman"><img src="https://avatars.githubusercontent.com/u/9095854?v=4?s=100" width="100px;" alt="Christopher Robert Hartman"/><br /><sub><b>Christopher Robert Hartman</b></sub></a><br /><a href="#ideas-ChrisHartman" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/miniBill"><img src="https://avatars.githubusercontent.com/u/191825?v=4?s=100" width="100px;" alt="Leonardo Taglialegne"/><br /><sub><b>Leonardo Taglialegne</b></sub></a><br /><a href="#ideas-miniBill" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/JackSouster"><img src="https://avatars.githubusercontent.com/u/96268675?v=4?s=100" width="100px;" alt="JackSouster"/><br /><sub><b>JackSouster</b></sub></a><br /><a href="https://github.com/taibeled/JetLagHideAndSeek/issues?q=author%3AJackSouster" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/fkloft"><img src="https://avatars.githubusercontent.com/u/2741656?v=4?s=100" width="100px;" alt="fkloft"/><br /><sub><b>fkloft</b></sub></a><br /><a href="#ideas-fkloft" title="Ideas, Planning, & Feedback">🤔</a> <a href="#data-fkloft" title="Data">🔣</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/InvestigateXM"><img src="https://avatars.githubusercontent.com/u/52758500?v=4?s=100" width="100px;" alt="InvestigateXM"/><br /><sub><b>InvestigateXM</b></sub></a><br /><a href="#ideas-InvestigateXM" title="Ideas, Planning, & Feedback">🤔</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Hawkguye"><img src="https://avatars.githubusercontent.com/u/121480806?v=4?s=100" width="100px;" alt="Hawkguye"/><br /><sub><b>Hawkguye</b></sub></a><br /><a href="#data-Hawkguye" title="Data">🔣</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/jlewis1778"><img src="https://avatars.githubusercontent.com/u/22303191?v=4?s=100" width="100px;" alt="jlewis1778"/><br /><sub><b>jlewis1778</b></sub></a><br /><a href="https://github.com/taibeled/JetLagHideAndSeek/commits?author=jlewis1778" title="Code">💻</a> <a href="https://github.com/taibeled/JetLagHideAndSeek/issues?q=author%3Ajlewis1778" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Bert-Moors"><img src="https://avatars.githubusercontent.com/u/89836592?v=4?s=100" width="100px;" alt="Bert-Moors"/><br /><sub><b>Bert-Moors</b></sub></a><br /><a href="https://github.com/taibeled/JetLagHideAndSeek/commits?author=Bert-Moors" title="Code">💻</a> <a href="https://github.com/taibeled/JetLagHideAndSeek/issues?q=author%3ABert-Moors" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/azyritedev"><img src="https://avatars.githubusercontent.com/u/206858676?v=4?s=100" width="100px;" alt="azyrite"/><br /><sub><b>azyrite</b></sub></a><br /><a href="https://github.com/taibeled/JetLagHideAndSeek/commits?author=azyritedev" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://metamoof.net/"><img src="https://avatars.githubusercontent.com/u/805751?v=4?s=100" width="100px;" alt="Giles Antonio Radford"/><br /><sub><b>Giles Antonio Radford</b></sub></a><br /><a href="#ideas-metamoof" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/madjayem"><img src="https://avatars.githubusercontent.com/u/71520186?v=4?s=100" width="100px;" alt="madjayem"/><br /><sub><b>madjayem</b></sub></a><br /><a href="#ideas-madjayem" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/palimer6"><img src="https://avatars.githubusercontent.com/u/26436548?v=4?s=100" width="100px;" alt="palimer6"/><br /><sub><b>palimer6</b></sub></a><br /><a href="https://github.com/taibeled/JetLagHideAndSeek/issues?q=author%3Apalimer6" title="Bug reports">🐛</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/fahmisack"><img src="https://avatars.githubusercontent.com/u/241826952?v=4?s=100" width="100px;" alt="fahmisack"/><br /><sub><b>fahmisack</b></sub></a><br /><a href="https://github.com/taibeled/JetLagHideAndSeek/issues?q=author%3Afahmisack" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://matchatea.dev"><img src="https://avatars.githubusercontent.com/u/46655509?v=4?s=100" width="100px;" alt="Issac Liu"/><br /><sub><b>Issac Liu</b></sub></a><br /><a href="https://github.com/taibeled/JetLagHideAndSeek/issues?q=author%3ACamuise" title="Bug reports">🐛</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->
