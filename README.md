# Kaleido

Kaleido is a GNOME Shell extension that extracts an accent color from your
wallpaper, turns it into a full Material-style palette, and applies it to your
entire desktop — the Shell, GTK apps, folder/app icons, **and your other
applications** through a catalog of themes.

It is a fork of [ChromaLeon](https://github.com/Fabito02/ChromaLeon) by
Fabito02, extended with a Noctalia v5 / matugen-compatible template engine and
an application theming catalog.

## Features

- **Dynamic extraction** — pulls a vibrant accent color from your current
  wallpaper.
- **Unified system theming** — applies the accent to GNOME Shell, Adwaita,
  adw-gtk3, and app/folder icons.
- **App theming** — renders the active palette into terminals, editors,
  launchers, compositors and more using a template catalog.
- **Material palette** — builds the full set of Material 3 color roles
  (`primary`, `surface`, containers, outlines, terminal colors, …) for both
  dark and light modes.
- **Tint, darker tint and full-light styles**, custom CSS, Flatpak support and
  icon recolouring.

## App theming

Enable **App Theming** in the extension preferences and pick the apps you want
to keep in sync. Each entry renders a template with the active palette and
writes a dedicated theme file. A few entries also add an `include`/`source`
line to the application's own configuration.

Shipped templates:

| App                  | Category   | What it writes                                   |
| -------------------- | ---------- | ------------------------------------------------ |
| Kitty                | terminal   | `~/.config/kitty/chromaleon…` (+ include)        |
| Alacritty            | terminal   | `~/.config/alacritty/chromaleon.toml`            |
| Foot                 | terminal   | `~/.config/foot/themes/chromaleon`               |
| Ghostty              | terminal   | `~/.config/ghostty/chromaleon`                   |
| WezTerm              | terminal   | `~/.config/wezterm/chromaleon.lua`               |
| tmux                 | terminal   | `~/.config/tmux/chromaleon.conf` (+ source)      |
| btop                 | system     | `~/.config/btop/themes/chromaleon.theme`         |
| Mako                 | system     | `~/.config/mako/chromaleon`                      |
| Waybar               | system     | `~/.config/waybar/chromaleon.css` (+ @import)    |
| Qt (qt5ct/qt6ct)     | system     | `…/qt5ct/colors/chromaleon.conf`, `qt6ct`        |
| Starship             | system     | `~/.config/starship-chromaleon.toml`             |
| Fuzzel               | launcher   | `~/.config/fuzzel/chromaleon.ini`                |
| Rofi                 | launcher   | `~/.config/rofi/chromaleon.rasi`                 |
| Hyprland             | compositor | `~/.config/hypr/chromaleon.conf` (+ source)      |
| Hyprlock             | compositor | `~/.config/hypr/chromaleon-lock.conf`            |
| Obsidian             | editor     | `~/.config/obsidian/snippets/chromaleon.css`     |

App theming is **opt-in** and off by default. Files are only rewritten when
their contents change.

## Template engine

The renderer is a self-contained, GJS-native port of the
[Noctalia v5](https://docs.noctalia.dev/noctalia/theming/templates/) template
syntax (which itself is matugen-compatible). Templates use:

```
{{ colors.primary.default.hex }}
{{ colors.surface.dark.rgb }}
{{ palettes.primary.40.hex }}
{{ colors.primary.default.hex | darken 10 | set_alpha 0.6 }}
```

- **Data model** — `colors.<token>.<mode>.<format>` and
  `palettes.<family>.<tone>.<format>`, where `mode` is `dark`, `light` or
  `default`.
- **Formats** — `hex`, `hex_stripped`, `rgb`, `rgb_csv`, `rgba`, `hsl`,
  `hsla`, `red`, `green`, `blue`, `alpha`, `hue`, `saturation`, `lightness`.
- **Filters** — `grayscale`, `invert`, `set_alpha`, `set_lightness`, `set_hue`,
  `rotate_hue`, `set_saturation`, `saturate`, `desaturate`, `lighten`,
  `darken`, `auto_lightness`, `set_red/green/blue`, `blend`, `harmonize`,
  `to_color`, and the string filters `replace`, `lower_case`, `camel_case`,
  `pascal_case`, `snake_case`, `kebab_case`.
- **Control flow** — `<* for x in y *>…<* endfor *>` and
  `<* if {{ cond }} *>…<* else *>…<* endif *>` with `loop.index/first/last`.

### Adding a template

1. Create the template file in `app-templates/`.
2. Add an entry to `app-templates/manifest.json`:

```json
{
  "id": "myapp",
  "name": "My App",
  "category": "system",
  "input": "myapp.conf",
  "output": "$XDG_CONFIG_HOME/myapp/theme.conf",
  "post_hook": "myapp --reload-theme"
}
```

`output` may be a string or an array of paths. `requires` skips the entry
unless a path exists, and `post_hook` runs a shell command after writing.

## Installation

```sh
git clone https://github.com/thatmechguy/Kaleido.git
mv Kaleido ~/.local/share/gnome-shell/extensions/kaleido@thatmechguy
glib-compile-schemas ~/.local/share/gnome-shell/extensions/kaleido@thatmechguy/schemas/
gnome-extensions enable kaleido@thatmechguy
```

Restart GNOME Shell on X11 with `Alt+F2`, `r`, `Enter`, or log out and back in
on Wayland.

## Compatibility

GNOME Shell 48 through 51.

## Credits and license

Kaleido is based on
[ChromaLeon](https://github.com/Fabito02/ChromaLeon) © Fabito02 and is released
under the GNU General Public License v3.0 or later. The template engine is a
compatible reimplementation of the Noctalia v5 template syntax.
