# 🌐 GitHub Multiverse

<img width="1369" height="768" alt="image" src="https://github.com/user-attachments/assets/1d43db17-2b05-41dd-a486-5373ef3742c3" />

A Decentraland-like, fully functional 3D collaborative metaverse built for developers. Instead of clunky character avatars, every developer walks the world as a custom **three-dimensional mouse pointer**. Everyone starts in **Genesis City**, one continuous, organic space around Genesis Plaza (no street grid, no square blocks) made of small themed scenes, with an **underground level** below the plaza, a **metro** to every district, and bigger **Worlds**: interactive mini-games and a Silicon Valley tech campus.

So, imagine to have a fun, useful and 3D virtual dimension world, just for devs like you. Meet new friends, code like a pro, discover who uses the same tools that you do, invite friends to dynamic workspaces and explore your world.

---

## 🚀 Features

- **Real-Time Multiplayer Sync**: Powered by Socket.io. Every developer's movement, chat, name and wearables are replicated instantly to all connected clients.

- **Genesis City + Worlds (like Decentraland)**: new developers spawn at **Genesis Plaza**, right in front of the square pool that leads underground. The small maps are scenes scattered organically around the plaza, linked by a ring promenade and winding cobblestone paths with lamps and banners; between them you find gardens, cottages, sculptures, kiosks, campfires with benches, picnic tables, digital art frames that open community links and "for sale" signs. The big maps (Silicon Valley, Museum, Debug Dungeon, Open Source HQ, Keynote Amphitheater, Green-Tech Sandbox) are separate **Worlds** you enter through the side menu, the metro or chat commands (`/world valley`).

## 📸 Screenshots & Gameplay 

<img width="800" height="500" alt="image-1792525351352" src="https://github.com/user-attachments/assets/e51c9163-3151-4232-91f6-772264bf64fc" />
<img width="1088" height="612" alt="36-Developers_Daily_Life" src="https://github.com/user-attachments/assets/8c64522a-3722-4fd8-98e5-f159a74165a6" />
<img width="595" height="260" alt="image3" src="https://github.com/user-attachments/assets/cebfb9e4-b438-4a1f-8690-5bf746b8613e" />
<img width="1000" height="563" alt="image4" src="https://github.com/user-attachments/assets/ded4936b-fe30-466b-b58d-c35c21ca26df" />
<img width="1088" height="612" alt="46-Multiverse_Forest" src="https://github.com/user-attachments/assets/3f3bb7e5-4e3c-4b8e-a596-f2b474e50b97" />
<img width="1000" height="319" alt="image5" src="https://github.com/user-attachments/assets/746b9980-eac2-4dd5-bf1b-485adae692dd" />
<img width="1088" height="612" alt="12-House_of_MAC" src="https://github.com/user-attachments/assets/63530818-6bbf-45fd-9d3d-0b004925129a" />
<img width="1280" height="720" alt="builder-mode" src="https://github.com/user-attachments/assets/4c902027-da09-432b-8937-63cd6ec93900" />
<img width="1088" height="612" alt="51-Retro_Arcade" src="https://github.com/user-attachments/assets/046310d2-a133-44b7-8651-c5ea7c7b05df" />
<img width="1088" height="612" alt="36-Developers_Daily_Life(1)" src="https://github.com/user-attachments/assets/1ea428d0-3a03-4e8f-b3ed-047cbcfc773f" />
<img width="800" height="500" alt="image-1792446237133" src="https://github.com/user-attachments/assets/4c46953c-ad7c-423f-a3eb-af59da0f9f9d" />
<img width="1000" height="583" alt="image1" src="https://github.com/user-attachments/assets/f3094d70-9e9f-4014-a209-5f9d65e75d96" />
<img width="1000" height="563" alt="image2" src="https://github.com/user-attachments/assets/eadcbb9c-87d5-4a44-882a-54e62bf1f917" />
<img width="800" height="500" alt="image-1792445068872" src="https://github.com/user-attachments/assets/4bddc482-7df5-4834-b512-a4debfb14c44" />

<details>
  <summary>🎮 Controls</summary>

  | Input | Action |
| --- | --- |
| `W A S D` / arrow keys | Walk (10 m/s) |
| `Shift` | Run (20 m/s) |
| `Space` | Jump (climb stairs, platforms and the CRT parkour) |
| Mouse drag | Look around (third-person camera) |
| Mouse wheel | Zoom the camera in and out |
| Click | Inspect an object, or interact (monsters, screens, booths, hammer) |
| `M` | Toggle the map view; click anywhere on the map to jump there |
| `Space` `Space` | Toggle creative flight (`Space` up, `Shift` down) |
| `E` | Interact: laptops, seats, coffee, arcades, fishing, showcases, event cards, loot |
| `1` - `5` | Use / equip the item in that hotbar slot |
| `I` | Open the inventory |
| Minimap click | Jump to that spot |
| `Enter`, `T` or `/` | Open the chat |
| `Esc` | Close the chat, info cards, the metro map and the video player |
| `N` | Open / close the Multiverse Metro map |
| `E` (while riding) | Get off a vehicle |
| `Shift` + `U` | Hide / show the whole interface (scenery only) |
| `C` | Open / close Codify (code editor) |
| `V` | Turn the sound of the video screens on / off |


## 💬 Chat commands

Type `/help` in game for the full list, or `/help <page>` for one section.

### Teleport and places
| Command | Action |
| --- | --- |
| `/tp <player>` | Teleport to another developer |
| `/tp <x> <z>` or `/tp <x> <y> <z>` | Teleport to coordinates (`~` for relative values, e.g. `/tp ~10 ~ ~-5`) |
| `/tpa <player>` | Ask to teleport to a player |
| `/tpahere <player>` | Ask a player to teleport to you |
| `/tpaccept` / `/tpdeny` | Answer a teleport request |
| `/world <place>` (also `/warp`, `/goto`) | Jump to a district or a Silicon Valley landmark |
| `/worlds` (also `/warps`) | List every place |
| `/spawn` | Back to Genesis Plaza |
| `/sethome` / `/home` | Save your current spot and come back to it later (stored in your browser) |
| `/metro [place]` (also `/train`) | Open the metro map, or ride the train straight to a place |
| `/bed` | Go back to the last bed you slept in (your spawn point) |
| `/sound [on\|off]` | Turn the sound effects on or off |
| `/quality [low\|medium\|high\|auto]` | Graphics quality (auto lowers it by itself when the game gets slow) |

### Economy (in-game coins only)
| Command | Action |
| --- | --- |
| `/balance` (also `/wallet`) | Your Multiverse Coins (MVC) |
| `/pay <player> <amount>` | Send coins to another developer |
| `/buyland` (also `/land`) | Buy the empty parcel you are standing on (250 MVC) |
| `/lands` | List your parcels |

> Moving **another** player always requires their consent (`/tpahere` + `/tpaccept`). There is no server operator, so nobody can drag other players around.

### World
| Command | Action |
| --- | --- |
| `/time set <day\|noon\|sunset\|night\|midnight\|0-24000>` | Set the shared time of day (Minecraft ticks: 0 = 06:00, 6000 = noon, 18000 = midnight) |
| `/time add <ticks>` / `/time query` | Advance or read the clock |
| `/gamerule doDaylightCycle <true\|false>` | Freeze or resume the day/night cycle |
| `/weather <clear\|rain\|snow\|thunder>` | Change the weather for everyone |

### Social
| Command | Action |
| --- | --- |
| `/nick <name>` | Rename yourself (3-16 letters, numbers or `_`) |
| `/msg <player> <text>` (also `/tell`, `/w`) | Private message |
| `/r <text>` | Reply to the last private message |
| `/me <action>` | Action message (`* carlos_dev waves`) |
| `/list` (also `/who`) | Who is online and in which district |
| `/coords` | Your position and parcel |
| `/e <wave\|dance\|cheer\|clap\|sit\|think\|ship\|coffee>` | Play an emote on your cursor |
| `/fly` | Toggle creative flight |
| `/commits` | How many commits you shipped from laptops |
| `/invite` | Copy an invite link to where you are |
| `/clear` | Clear the chat log |

### Loot
| Command | Action |
| --- | --- |
| `/inv` (also `/inventory`) | Open the inventory |
| `/use <n>` | Use or equip item number `n` |
| `/drop <n>` | Throw item number `n` away |
| `/loot` | Show the nearest available chest or supply drop |

### District mini-games
| Command | Where | Action |
| --- | --- | --- |
| `/bugs` | Debug Dungeon | List the bugs that are alive, their HP and weakness |
| `/script <gc\|try-catch\|break\|mutex\|unit-test\|reboot>` | Debug Dungeon | Cast a script on the nearest bug (super effective against its weakness) |
| `/mural <1-4> <code>` | Open Source HQ | Post a line of code on a mural |
| `/pr <slot 1-8> <tree\|lamp\|banner\|fountain\|duck\|flag\|neon\|bench> [hexcolor]` | Open Source HQ | Open a Pull Request that changes a decoration |
| `/prs` | Open Source HQ | List open Pull Requests |
| `/approve <n>` / `/merge <n>` / `/close <n>` | Open Source HQ | Review, merge or close a Pull Request |
| `/keynotes` / `/watch [n]` | Keynote Amphitheater | List the keynote playlist and play one |
| `/stream <YouTube or Twitch URL> [title]` / `/endstream` | Keynote Amphitheater | Put a live event on the big screen for everyone, or go back to the playlist |
| `/wear <hoodie\|mug\|cap\|headphones\|none>` | Anywhere | Dress your cursor with a dev wearable |
| `/plant` | Green-Tech Sandbox | Plant a tree where your cursor stands (up to 10 per dev) |
| `/energy` | Green-Tech Sandbox | Show the district's renewable energy level |
</details>


<details>
  <summary><b> 🎁 Loot</b></summary>
  <br>

Golden **chests** sit on street corners all over Genesis City and next to the Silicon Valley headquarters. Walk up to one and press **E**: the server rolls an item, and the chest respawns 2 minutes later. Every 3 minutes a **supply drop** falls from the sky under a balloon, with a blue beam of light visible from far away and a chat announcement; it holds Rare to Legendary loot for whoever opens it first. Epic and Legendary finds are announced to everyone.

| Rarity | Chest odds | Supply drop odds | Items |
| --- | --- | --- | --- |
| Common (grey) | 45% | - | ☕ Espresso Shot (run faster 20s), 🧢 Hackathon Cap, ✅ Green CI Badge (confetti), 🗒️ Sticky Note of Wisdom (dev tip) |
| Uncommon (green) | 30% | - | ⚡ Energy Drink (jump higher 20s), 🍵 Mug of Infinite Coffee, 💡 Accepted Stack Overflow Answer |
| Rare (blue) | 15% | 45% | 🦆 Rubber Duck Debugger (a pet that follows you), 🎧 Noise-Cancelling Headphones, 🔨 Git Commit Hammer, 🌀 Teleport Token |
| Epic (purple) | 8% | 40% | 🧥 Senior Dev Hoodie, 🔍 Debugger Lens (double damage vs bugs 60s), ⏪ git revert Scroll (undo your last teleport) |
| Legendary (gold) | 2% | 15% | 🚀 Jetpack.js (hold Space to fly 30s), 👑 10x Engineer Crown |

Wearables show on your cursor for everyone. Consumables are used up; wearables, the duck and the hammer can be equipped any time. The inventory holds 20 items. The catalog, odds and chest spots live in `public/maps/loot.json`.

</details>

<details>
  <summary><b>## 🧱 Build your own scene (Decentraland-style)</b></summary>
  <br>

Like Decentraland, every 16 m parcel of land can hold a scene built by its owner, while the districts stay as Genesis City's own content.

- **Estates**: adjacent parcels of the same owner merge into one estate and are built as one scene.
- **Scene manifest** (like `scene.json`): `display` (title, description), `owner`, `scene.parcels` / `scene.base`, `spawnPoints` and a list of `entities` (`item`, `position`, `rotation`, `scale`, `props`).
- **Limits per scene, with n parcels:**
  - height: log2(n+1) x 20 m;
  - up to 200 x n entities and 10,000 x n triangles;
  - limited materials and textures;
  - nothing may leave the parcels.
- **Builder**: press **B** on a parcel you own.
  - **Catalog:** floors, wall, glass, stairs, platform, column, color cube, trees, plant, bench, table, chair, lamp, fire pit, text sign, YouTube/image screen, laptop and a portal.
  - **Editing:** click to place or select, **G** move, **R** rotate, **[ ]** scale, **PgUp/PgDn** height, **Del** delete, **Ctrl+Z/Y** undo/redo, **Ctrl+D** duplicate.
  - **Feedback:** a grid snap, a green/red ghost, the parcel outline with the height limit and a limits HUD.
  - **Panel buttons:** Set spawn, Save (draft) and Publish.
- **Server**: validates ownership, bounds and limits with the same rules as the client, saves scenes in `data/scenes.json`, sends every published scene to whoever connects and broadcasts new ones.
- **Loading**: scenes are built lazily, nearest first. Entering one shows its title, the city map shows each scene's outline and title, and `/goto x,y` jumps to a parcel (and to its scene's spawn point). In solo mode scenes are kept in the browser.

</details>

## 🗺️ Maps

Every map is a JSON file in `public/maps/` and is registered in `public/maps/worlds.json`: small maps get a `cell` on the Genesis City grid, big maps are marked `"world": true` and get their own far-away `region`. Each `type` in a map is turned into the object it describes (a palm tree, an arcade cabinet, a Kanban board...) by the builders in `public/props.js`, `landmarks.js`, `museum.js` and `games.js`.

---

## 💻 Local Setup

### 1. Prerequisites
[Node.js](https://nodejs.org) v18 or higher.

### 2. Installation
```bash
# 1. Install dependencies
npm install

### 3. Execution
```bash
npm start

### 4. Open Interface
```text
http://localhost:3000
```

*💡 **Pro Tip**: Open a second Incognito/Private window next to the first one, create a second account, and see two developers walking, chatting, looting and squashing bugs together.*

Deep links drop you straight into a place, e.g. `http://localhost:3000/#applepark` or `http://localhost:3000/#dungeon`.

---

<details>
  <summary><b>## 🧱 Adding a map</b></summary>
  <br>

1. Create `public/maps/map_<name>.json` (the existing district maps are bundled in `public/maps/districts.json` under their file names; a new map can go in its own file or as a new entry in that bundle):
   ```json
   {
     "themeName": "My District",
     "backgroundColor": "#1e1e24",
     "blocks": [
       { "type": "floor", "position": [0, -0.5, 0], "scale":, "color": "#2d2d34" },
       { "type": "kanban_board_todo", "position": [0, 3, -10], "scale": [6, 5, 0.3], "color": "#ffffff", "label": "Kanban: To Do" }
     ]
   }
   ```
   <br>
   `position` and `scale` are `[x, y, z]` in meters relative to the district center. `label` shows on hover and in the info card.
2. Register it in `public/maps/worlds.json`. A small scene takes a free `cell` on the city grid (districts are built 1.5× the 64 m cell, so a cell district is about 88 m wide), or an exact `region` anywhere on the parcel grid:
   ```json
   { "key": "mydistrict", "file": "map_my_district.json", "name": "My District", "description": "...", "cell": [-3, 2], "color": "#ff2d7a" }
   ```
   <br>
   A big map becomes a separate World with its own island, far from the city:
   ```json
   { "key": "myworld", "file": "map_my_world.json", "name": "My World", "description": "...", "world": true, "region": { "center":, "size": [120, 120] }, "color": "#3a86ff" }
   ```

The block `type` decides the model. Some of the recognized types: `floor`, `wall`, `road`, `water`, `desk`, `table`, `sofa`, `stairs_step`, `kanban_board_*`, `sticky_note`, `palm_trunk`, `palm_leaves`, `arcade_cabinet_*`, `pool_table_base`, `server_rack`, `neon_pillar`, `stage`, `pedestal`, `plant`, `billboard`, `hq_<company>`, and many more (see the rule lists at the end of each builder file). Unknown types fall back to an outlined block.

</details>


<details>
  <summary><b>## ☁️ Deploying</b></summary>
  <br>

Multiplayer needs the Node server running on a host that keeps a Node process alive and supports WebSockets (e.g. Render, Railway or Fly.io). Static hosts such as Vercel only serve the `public/` folder: the universe still loads, but in **solo mode** (no other devs; mini-game state stays local).

Accounts and inventories are saved in `data/users.json`; give the host a persistent disk (or volume) so they survive redeploys. The rest of the game state (leaderboard, murals, Pull Requests, planted trees, live stream, chests) lives in the server's memory and resets when the server restarts.

Optional environment variables:
<br>

| Variable | What it does |
| --- | --- |
| `PORT` | Server port (default 3000) |
| `SUPPLY_DROP_EVERY_MS` | Time between supply drops (default 180000, 3 minutes) |
| `GITHUB_TOKEN` | GitHub token for the Tech Square commits/PRs mural (works without it, with GitHub's lower rate limit) |
| `FINNHUB_API_KEY` | Free [Finnhub](https://finnhub.io) key for the stock scoreboard. Without it the scoreboard says it is not configured: prices are never invented |
| `DISABLE_FEEDS=1` | Turn off all live feeds (offline / tests) |

</details>

---

## ⚡ Performance

The world has more than ten thousand objects, so the game only draws what is near you:

- **Distance culling:** buildings are skipped only where the fog already hides them completely (the view never changes), and small details (benches, lamps, plants) are skipped beyond 70–170 m depending on the quality level.
- **Automatic quality:** the game watches the frame rate and, when it gets slow, lowers the resolution, turns off shadows and draws small details closer; it goes back up when there is room. Use `/quality low | medium | high | auto` to choose (or `minimum` on very old computers); the choice is remembered in the browser.
- **Steady walking speed:** slow frames are split into small physics steps, so you walk at the same speed at 20 or 60 FPS.
- **Lighter scene:** no point lights (fires and lamps glow on their own), shadows only from large objects, and lighter rounded boxes.

---

## ⚖️ Trademarks & media

Brand logos on billboards, HQ signs and the Apple Store come from [Simple Icons](https://simpleicons.org) (the icon artwork is released as CC0) and the ones used in the world are bundled in `public/vendor/simple-icons.json` so they work offline (any other icon is loaded from the jsDelivr CDN). Brands that are not in Simple Icons (for example OpenAI, AWS, Microsoft, Oracle or Adobe) appear as plain text wordmarks. Logos are trademarks of their owners and are used only to identify the companies; billboards show the logo, the name and a factual description, never real ad campaigns. Company names elsewhere appear as plain text wordmarks in brand colors to identify the landmarks they represent; the buildings are stylized recreations, not copies of real architecture plans or photos. The WWDC keynotes are not stored in this repository: they are played through YouTube's official embedded player from Apple's own YouTube channel, and the screen shows YouTube's thumbnails. The vehicles are original designs only *inspired by* real cars, with no brand names or logos, and are in-game items (no NFTs). The Hall of Internet History shows illustrated recreations, not screenshots. The Tower of Icons music is generated live in the browser (Web Audio), not recorded songs. The GitHub Multiverse logo is based on GitHub's Octocat mark. All trademarks, including GitHub and the Octocat, belong to their respective owners; this is a fan project, not affiliated with or endorsed by any of these companies.

---

## Can I Contribute?

Contributions are welcome on this repo! Please fork, share the web link to your Discord servers, star this repo and make this get popular.
Obs.: Read the contributing.txt file before for more info :)

## 🤝 Contributors & Partners

This project is proudly supported and built in collaboration with:

- Apple Official
- Decentraland.org

---

## Also rip Zuckerberg's metaverse lol



<details>
<summary>🪦 Open Letter to Mark Zuckerberg (Click to expand)</summary>

Dear Mark, 

We saw what you tried to do with Horizon Worlds. We appreciated the effort, but devs don't need expensive VR goggles to look at low-poly empty plazas. They just need a terminal, a browser, and a way to judge each other's code. 

Rest in peace, corporate metaverse. The open-source community takes it from here.
</details>

---

## ⚖️ Disclaimer
Company names and structures are stylized wordmark recreations for identification purposes. Keynotes are streamed directly from official Apple/Google YouTube embeds. All trademarks belong to their respective owners.
