# 🌷 Garden Claude

A tiny pixel-art Claude who keeps a flower garden right above your Claude Code prompt.

Every time Claude uses a tool while helping you, it does a little garden chore too. You write code; Claude grows flowers. 🌱

![Garden Claude planting, watering, picking and selling flowers](docs/garden.gif)

## 🧺 A day in the garden

| | |
| --- | --- |
| 🌰 **Plant** | Claude crouches and tosses a seed into an empty plot |
| 💧 **Water** | Tip the watering can and the sprout grows: seed → sprout → bud → bloom |
| 🌼 **Pick** | A bloom goes into the basket with a happy little hop |
| 🪙 **Sell** | When the basket holds 3 flowers, Claude trots to the striped stall and sells them |

Six kinds of flowers grow here, each worth a different number of coins:

daisy 2 · tulip 3 · lavender 3 · sunflower 4 · cornflower 4 · rose 5

Your garden and coins are saved, so they're waiting for you in every new session. 💰

## 👒 The wardrobe

Claude puts on a new outfit every hour, and every outfit has its own idle animation.

![Claude in sunglasses, headphones, a straw hat, a flower crown and bunny ears](docs/wardrobe.gif)

- 😎 **Sunglasses**: a glint sweeps across the lenses
- 🎧 **Headphones**: bopping along while little music notes float up
- 👒 **Straw hat**: a blue butterfly circles the brim
- 🌸 **Flower crown**: the blossoms twinkle and swap colors
- 🐰 **Bunny ears**: blushing cheeks and an ear that flops now and then

When there's nothing to do, Claude rests in the shade: breathing, blinking and glancing around.

## 📊 Your stats, right next door

Next to the garden sits a little status board:

```
$8.70 · Opus 5.5
ctx ▆▆▆▁▁▁▁▁▁▁  32%
5h  ▁▁▁▁▁▁▁▁▁▁   1% · 4h25m
7d  ▆▆▆▁▁▁▁▁▁▁  34% · 2d23h
```

That's the session cost, the model, how full the context is, and your 5-hour and 7-day usage with time until each resets. The bars turn from green to gold at 70% and to red at 90%.

The board isn't pixel art like the garden: it's regular terminal text with chunky block bars, so the numbers stay easy to read.

Since this covers what most status lines show, you may want to turn off your own `statusLine` setting so the numbers don't show twice.

## 🌱 Install

```sh
claude plugin marketplace add milkoya/garden-claude
claude plugin install garden-claude@milkoya
```

Start a new Claude Code session and your garden appears above the prompt.

**Or by hand:** clone this repo into `~/.claude/mods/garden-claude`, then either run `claude --plugin-dir ~/.claude/mods`, or add this to `~/.claude/settings.json` so it loads every time:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods"
  }
}
```

### Good to know

- Garden Claude is built on Claude Code's **function hooks**, an early-access feature that's still rolling out. If your Claude Code doesn't load it yet, it will once the feature reaches you.
- The pixel art draws in the **terminal**. The desktop app shows a one-line caption instead.
- It fits itself to your window:
  - **77+ columns:** the garden with the stats board beside it
  - **46–76 columns:** the garden with a one-line stats bar underneath
  - **Smaller:** just the stats and caption, as text
- Collapse the band anytime with `ctrl+x ctrl+a`.

## 🛠️ Tinkering

| File | What's inside |
| --- | --- |
| `hooks/garden.ts` | The garden rules, the pixel painter and every animation |
| `hooks/layout.ts` | How the band fits different window sizes |
| `hooks/stats.ts` | The status board's bars and numbers |
| `hooks/register.tsx` | The hooks that connect it all to Claude Code |

Check your changes with:

```sh
claude plugin validate .
claude plugin test .
```

## 💌 License

MIT © Mio. Plant freely, share freely. 🌼
