# Changelog

Versions are `YY.MM.REV`: the year, the month, and the release number within that month.

## v26.11.2

- Pebble Round 2 support (beta): its own layout in the style of the game's minimap, drawn big
  for the round screen. A 35 px clock and date on top; the minimap shows your hiscore at a glance
  with your XP to the next level as a ring round it, like the game's XP orb; bigger orbs either
  side; the chatbox across the middle and the weather at the bottom, all in larger text. Built
  and tested on the Round 2 emulator; reports from real watches are very welcome.
- Themes: Classic stone, Dark (the modern client's look) and Bright (easiest to read in sunlight),
  with a live preview of each in Settings
- Timeline Quick View: the face now makes room for the peek instead of drawing under it
- New hiscores panel modes: a boss or clue kill count of your choice (Old School), and a Grand
  Exchange price watch for one item (prices from the OSRS Wiki)
- Level-up moments: when a refresh finds a new level, the panel and chatbox celebrate it for an hour
- Account helms beside your name for Ironman, Hardcore and Ultimate accounts
- New chatbox messages, each with its own switch: a rain countdown, the next sunrise or sunset, the
  feels-like temperature, wind, level-ups and the GE price
- Settings: a Look tab, the kill-count picker and GE item, chatbox switches grouped by topic, and
  the preview shows the round layout when your watch is a Round 2
- Lighter on memory: each watch now gets only its own layout and fonts, which keeps headroom with
  every new feature switched on

## v26.11.1

First public release.

- Game-screen layout for the Pebble Time 2: pixel clock and date, four status orbs, weather,
  hiscores and a chatbox
- Orbs: battery (Hitpoints), heart rate (Prayer), steps today filling towards your goal (Run
  energy), sleep over the last 24 hours (Special attack)
- Live weather from Open-Meteo using your phone's GPS or a city you choose, in Celsius or
  Fahrenheit
- Your real hiscores, in four modes: one skill, rotate, closest to a level-up, XP gained today
  - Old School RuneScape: Regular, Ironman, Hardcore and Ultimate
  - RuneScape 3: Regular, Ironman and Hardcore, via RuneMetrics (levels to 120)
  - Track one game or both at once, each with its own character
- Original pixel fonts and 45 original icons, covering every skill in both games
- Choose what each orb shows: battery, heart rate, steps, sleep, active minutes, distance or
  calories, each with its own goal
- Choose which chatbox messages run, or show just the date
- Settings page in the Pebble app with a live preview of the face and a skill picker laid out
  like the in-game skills tab
- Comes straight back when you return from Timeline, Health or an app: the frame, clock and
  date show at once, with no blank screen while it starts
