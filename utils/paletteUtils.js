/*
 * paletteUtils.js
 *
 * This file is part of Kaleido GNOME Shell Extension.
 * https://github.com/thatmechguy/Kaleido
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * Derives a Material-Design-style theme token map from a single accent color.
 *
 * The resulting structure matches the Noctalia v5 / matugen data model consumed
 * by templateEngine.js:
 *
 *   {
 *     colors:   { <token>: { dark: {hex,...}, light: {...}, default: {...} } },
 *     palettes: { <family>: { "<tone>": {hex,...}, "_<tone>": {...} } },
 *     mode: "dark" | "light",
 *   }
 *
 * It is a faithful-but-approximate HSL tonal palette: tones map directly to HSL
 * lightness, which keeps the generated roles recognisably related to the seed
 * color without shipping a full CAM16/HCT implementation in GJS.
 */

import { Color, formatColor, hexToRgb, rgbToHsl, clamp } from "./templateEngine.js";

export const FAMILIES = [
  "primary",
  "secondary",
  "tertiary",
  "error",
  "neutral",
  "neutral_variant",
];

// [token, family, lightTone, darkTone]
const ROLE_MAP = [
  ["primary", "primary", 40, 80],
  ["on_primary", "primary", 100, 20],
  ["primary_container", "primary", 90, 30],
  ["on_primary_container", "primary", 10, 90],
  ["primary_fixed", "primary", 40, 40],
  ["primary_fixed_dim", "primary", 80, 80],
  ["on_primary_fixed", "primary", 10, 10],
  ["on_primary_fixed_variant", "primary", 30, 30],

  ["secondary", "secondary", 40, 80],
  ["on_secondary", "secondary", 100, 20],
  ["secondary_container", "secondary", 90, 30],
  ["on_secondary_container", "secondary", 10, 90],
  ["secondary_fixed", "secondary", 40, 40],
  ["secondary_fixed_dim", "secondary", 80, 80],
  ["on_secondary_fixed", "secondary", 10, 10],
  ["on_secondary_fixed_variant", "secondary", 30, 30],

  ["tertiary", "tertiary", 40, 80],
  ["on_tertiary", "tertiary", 100, 20],
  ["tertiary_container", "tertiary", 90, 30],
  ["on_tertiary_container", "tertiary", 10, 90],
  ["tertiary_fixed", "tertiary", 40, 40],
  ["tertiary_fixed_dim", "tertiary", 80, 80],
  ["on_tertiary_fixed", "tertiary", 10, 10],
  ["on_tertiary_fixed_variant", "tertiary", 30, 30],

  ["error", "error", 40, 80],
  ["on_error", "error", 100, 20],
  ["error_container", "error", 90, 30],
  ["on_error_container", "error", 10, 90],

  ["background", "neutral", 99, 10],
  ["on_background", "neutral", 10, 90],
  ["surface", "neutral", 98, 10],
  ["on_surface", "neutral", 10, 90],
  ["surface_variant", "neutral_variant", 90, 30],
  ["on_surface_variant", "neutral_variant", 30, 80],
  ["surface_dim", "neutral", 87, 10],
  ["surface_bright", "neutral", 98, 30],
  ["surface_container_lowest", "neutral", 100, 4],
  ["surface_container_low", "neutral", 96, 10],
  ["surface_container", "neutral", 94, 12],
  ["surface_container_high", "neutral", 92, 17],
  ["surface_container_highest", "neutral", 90, 22],
  ["outline", "neutral_variant", 50, 60],
  ["outline_variant", "neutral_variant", 80, 30],
  ["shadow", "neutral", 0, 0],
  ["scrim", "neutral", 0, 0],
  ["inverse_surface", "neutral", 20, 90],
  ["inverse_on_surface", "neutral", 95, 20],
  ["inverse_primary", "primary", 80, 40],

  ["hover", "tertiary", 40, 80],
  ["on_hover", "tertiary", 100, 20],
];

const ANSI_SPECS = {
  black: { hue: null, sat: 0 },
  red: { hue: 0, sat: 70 },
  green: { hue: 130, sat: 55 },
  yellow: { hue: 80, sat: 65 },
  blue: { hue: 250, sat: 65 },
  magenta: { hue: 320, sat: 60 },
  cyan: { hue: 190, sat: 60 },
  white: { hue: null, sat: 0 },
};

const ANSI_TONES = {
  black: { normal: [18, 25], bright: [40, 40] },
  white: { normal: [92, 95], bright: [98, 60] },
};

function toFamilyHueSat(baseHue, baseSat) {
  const sat = clamp(baseSat, 0, 100);

  return {
    primary: { hue: baseHue, sat },
    secondary: { hue: baseHue, sat: clamp(sat * 0.5, 8, 60) },
    tertiary: { hue: baseHue + 60, sat },
    error: { hue: 4, sat: 80 },
    neutral: { hue: baseHue, sat: 4 },
    neutral_variant: { hue: baseHue, sat: 10 },
  };
}

function buildPalettes(familyHueSat) {
  const palettes = {};

  for (const family of FAMILIES) {
    const { hue, sat } = familyHueSat[family];
    const tones = {};

    for (let tone = 0; tone <= 100; tone++) {
      const leaf = formatColor(Color.fromHsl(hue, sat, tone));
      tones[String(tone)] = leaf;
      tones[`_${tone}`] = leaf;
    }

    palettes[family] = tones;
  }

  return palettes;
}

function leafFor(palettes, family, tone) {
  return palettes[family][String(tone)];
}

function makeColor(lightLeaf, darkLeaf, mode) {
  return {
    light: lightLeaf,
    dark: darkLeaf,
    default: mode === "light" ? lightLeaf : darkLeaf,
  };
}

function synthLeaf(hue, sat, tone) {
  return formatColor(Color.fromHsl(hue, sat, tone));
}

export function buildThemeData(accentHex, options = {}) {
  const mode = options.defaultMode === "light" ? "light" : "dark";
  const accent = hexToRgb(accentHex) ? accentHex : "#785ef0";
  const { r, g, b } = hexToRgb(accent);
  const { h, s } = rgbToHsl(r, g, b);

  const familyHueSat = toFamilyHueSat(h, s);
  const palettes = buildPalettes(familyHueSat);

  const colors = {};

  for (const [token, family, lightTone, darkTone] of ROLE_MAP) {
    colors[token] = makeColor(
      leafFor(palettes, family, lightTone),
      leafFor(palettes, family, darkTone),
      mode,
    );
  }

  // Terminal tokens are synthesised from the palette.
  const neutral = familyHueSat.neutral;

  colors.terminal_background = makeColor(
    leafFor(palettes, "neutral", 98),
    leafFor(palettes, "neutral", 10),
    mode,
  );
  colors.terminal_foreground = makeColor(
    leafFor(palettes, "neutral", 12),
    leafFor(palettes, "neutral", 90),
    mode,
  );
  colors.terminal_cursor = makeColor(
    colors.primary.light,
    colors.primary.dark,
    mode,
  );
  colors.terminal_cursor_text = makeColor(
    colors.on_primary.light,
    colors.on_primary.dark,
    mode,
  );
  colors.terminal_selection_bg = makeColor(
    colors.primary_container.light,
    colors.primary_container.dark,
    mode,
  );
  colors.terminal_selection_fg = makeColor(
    colors.on_primary_container.light,
    colors.on_primary_container.dark,
    mode,
  );

  for (const [name, spec] of Object.entries(ANSI_SPECS)) {
    const hue = spec.hue === null ? neutral.hue : spec.hue;
    const sat = spec.hue === null ? neutral.sat : spec.sat;
    const tones = ANSI_TONES[name] ?? { normal: [70, 42], bright: [86, 58] };

    colors[`terminal_normal_${name}`] = makeColor(
      synthLeaf(hue, sat, tones.normal[1]),
      synthLeaf(hue, sat, tones.normal[0]),
      mode,
    );
    colors[`terminal_bright_${name}`] = makeColor(
      synthLeaf(hue, sat, tones.bright[1]),
      synthLeaf(hue, sat, tones.bright[0]),
      mode,
    );
  }

  return { colors, palettes, mode };
}
