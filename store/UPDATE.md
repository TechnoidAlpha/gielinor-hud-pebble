# Updating the appstore listing to v26.11.2

Everything the [Pebble developer dashboard](https://developer.repebble.com/dashboard) asks for is in
this folder. The steps follow the official guides:
[Publishing an App](https://developer.repebble.com/guides/appstore-publishing/publishing-an-app/) and
[Preparing a Submission](https://developer.repebble.com/guides/appstore-publishing/preparing-a-submission/).

## 1. Get the .pbw

Use `GielinorHUD-v26.11.2.pbw` from the
[v26.11.2 GitHub release](https://github.com/TechnoidAlpha/gielinor-hud-pebble/releases/tag/v26.11.2),
built by the release workflow from the tagged source. It contains both watches (emery for the
Time 2, gabbro for the Round 2). That matters: **the appstore offers only the newest published
release, and uses its binaries to decide which watches can install the face.**

## 2. Add the release

1. Dashboard → **Gielinor HUD** → **New Release**.
2. Upload `GielinorHUD-v26.11.2.pbw`. The version (26.11.2) must be one the listing hasn't used
   before; it is.
3. **Release notes:** paste the text of [`release-notes.txt`](release-notes.txt).
4. Leave **Publish immediately** ticked, then **Create Release**.

If something looks wrong afterwards, each release has a **Mark Draft** toggle, which takes it down
and leaves v26.11.1 as the newest published release.

## 3. Update the listing

Dashboard → **Gielinor HUD** → **Edit**:

- **Description:** replace it with the text of [`description.txt`](description.txt) (plain text).
- **Screenshots, Pebble Time 2 (emery, 200×228):** up to five, unframed. Use, in order:
  `emery_1_demo.gif` (animated), `emery_2_hero.png`, `emery_3_dark.png`, `emery_4_today.png`,
  `emery_5_kc.png`.
- **Screenshots, Pebble Round 2 (gabbro, 260×260):** this platform is new, so add its set:
  `gabbro_1_hero.png`, `gabbro_2_levelup.png`, `gabbro_3_dark.png`, `gabbro_4_kc.png`,
  `gabbro_5_today.png`.
- **Banner (720×320, optional):** `banner.png`, which shows both watches.

Save. Listing pages can be cached for up to ten minutes, so give it a moment before checking.

## 4. Check

- The listing's platforms include the Round 2, and both screenshot sets show.
- "Version" reads 26.11.2.
- On your phone, the Pebble app offers the update (or reinstall the face from the store).
