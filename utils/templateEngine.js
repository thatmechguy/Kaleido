/*
 * templateEngine.js
 *
 * This file is part of Kaleido GNOME Shell Extension.
 * https://github.com/thatmechguy/Kaleido
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * A self-contained, GJS-native port of the Noctalia v5 / matugen-compatible
 * template engine.
 *
 * Syntax:
 *   Inline expressions: {{ colors.primary.default.hex }}
 *   Blocks:             <* for name, value in colors *>...<* endfor *>
 *                       <* if {{ loop.first }} *>...<* endif *>
 *
 * Data model:
 *   colors.<name>.<mode>.<format>     mode = dark | light | default
 *   palettes.<family>.<tone>.<format> family = primary, secondary,
 *                                     tertiary, error, neutral,
 *                                     neutral_variant
 *
 * This module has no GI dependencies so it can be unit-tested and reused.
 */

const BLOCK_RE = /<\*\s*([\s\S]*?)\s*\*>/g;
const EXPR_RE = /\{\{\s*([\s\S]*?)\s*\}\}/g;
const STANDALONE_BLOCK_RE = /^[ \t]*(<\*[\s\S]*?\*>)[ \t]*\r?\n/gm;

const StringFilters = {
  replace: (value, args) => String(value).split(args[0] ?? "").join(args[1] ?? ""),
  lower_case: (value) => String(value).toLowerCase(),
  upper_case: (value) => String(value).toUpperCase(),
  snake_case: (value) => tokenizeWords(value).join("_"),
  kebab_case: (value) => tokenizeWords(value).join("-"),
  camel_case: (value) =>
    tokenizeWords(value)
      .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(""),
  pascal_case: (value) =>
    tokenizeWords(value)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(""),
};

function tokenizeWords(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-\s]+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  let value = hex.trim().replace(/^#/, "");

  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }

  let r, g, b, a;
  if (/^[0-9a-fA-F]{6}$/.test(value)) {
    r = parseInt(value.slice(0, 2), 16);
    g = parseInt(value.slice(2, 4), 16);
    b = parseInt(value.slice(4, 6), 16);
    a = 1;
  } else if (/^[0-9a-fA-F]{8}$/.test(value)) {
    r = parseInt(value.slice(0, 2), 16);
    g = parseInt(value.slice(2, 4), 16);
    b = parseInt(value.slice(4, 6), 16);
    a = parseInt(value.slice(6, 8), 16) / 255;
  } else {
    return null;
  }

  return { r, g, b, a };
}

export function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;

  return { h: (h / 6) * 360, s: s * 100, l: l * 100 };
}

export function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;

  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }

  const hueToRgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: hueToRgb(p, q, h + 1 / 3) * 255,
    g: hueToRgb(p, q, h) * 255,
    b: hueToRgb(p, q, h - 1 / 3) * 255,
  };
}

export class Color {
  constructor(r, g, b, a = 1) {
    this.r = clamp(Math.round(r), 0, 255);
    this.g = clamp(Math.round(g), 0, 255);
    this.b = clamp(Math.round(b), 0, 255);
    this.a = clamp(a, 0, 1);
  }

  static fromHex(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    return new Color(rgb.r, rgb.g, rgb.b, rgb.a);
  }

  static fromHsl(h, s, l, a = 1) {
    const { r, g, b } = hslToRgb(h, s, l);
    return new Color(r, g, b, a);
  }

  clone() {
    return new Color(this.r, this.g, this.b, this.a);
  }

  get hsl() {
    return rgbToHsl(this.r, this.g, this.b);
  }

  toHex() {
    const hex = (v) => v.toString(16).padStart(2, "0");
    return `#${hex(this.r)}${hex(this.g)}${hex(this.b)}`;
  }

  toHexStripped() {
    return this.toHex().slice(1);
  }

  toRgbString() {
    return `rgb(${this.r}, ${this.g}, ${this.b})`;
  }

  toRgbCsv() {
    return `${this.r},${this.g},${this.b}`;
  }

  toRgbaString() {
    return `rgba(${this.r}, ${this.g}, ${this.b}, ${round(this.a, 3)})`;
  }

  toHslString() {
    const { h, s, l } = this.hsl;
    return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  }

  toHslaString() {
    const { h, s, l } = this.hsl;
    return `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${round(this.a, 3)})`;
  }

  toString() {
    return this.a < 1 ? this.toRgbaString() : this.toHex();
  }
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatColor(color) {
  const { h, s, l } = color.hsl;
  return {
    hex: color.toHex(),
    hex_stripped: color.toHexStripped(),
    rgb: color.toRgbString(),
    rgb_csv: color.toRgbCsv(),
    rgba: color.toRgbaString(),
    hsl: color.toHslString(),
    hsla: color.toHslaString(),
    red: color.r,
    green: color.g,
    blue: color.b,
    alpha: round(color.a, 3),
    hue: Math.round(h),
    saturation: Math.round(s),
    lightness: Math.round(l),
  };
}

function parseColorValue(value) {
  if (value instanceof Color) return value.clone();
  if (typeof value === "number") return null;

  const str = String(value).trim();

  const fromHex = Color.fromHex(str);
  if (fromHex) return fromHex;

  const rgbMatch = str.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i,
  );
  if (rgbMatch) {
    return new Color(
      Number(rgbMatch[1]),
      Number(rgbMatch[2]),
      Number(rgbMatch[3]),
      rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : 1,
    );
  }

  const hslMatch = str.match(
    /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/i,
  );
  if (hslMatch) {
    return Color.fromHsl(
      Number(hslMatch[1]),
      Number(hslMatch[2]),
      Number(hslMatch[3]),
      hslMatch[4] !== undefined ? Number(hslMatch[4]) : 1,
    );
  }

  return null;
}

function applyColorFilter(color, name, args) {
  const arg = args[0];
  const numeric = Number(arg);

  switch (name) {
    case "grayscale": {
      const y = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
      color.r = color.g = color.b = y;
      break;
    }
    case "invert":
      color.r = 255 - color.r;
      color.g = 255 - color.g;
      color.b = 255 - color.b;
      break;
    case "set_alpha":
      color.a = clamp(numeric, 0, 1);
      break;
    case "set_lightness": {
      const { h, s } = color.hsl;
      const { r, g, b } = hslToRgb(h, s, numeric);
      color.r = r;
      color.g = g;
      color.b = b;
      break;
    }
    case "set_hue": {
      const { s, l } = color.hsl;
      const { r, g, b } = hslToRgb(numeric, s, l);
      color.r = r;
      color.g = g;
      color.b = b;
      break;
    }
    case "rotate_hue": {
      const { h, s, l } = color.hsl;
      const { r, g, b } = hslToRgb(h + numeric, s, l);
      color.r = r;
      color.g = g;
      color.b = b;
      break;
    }
    case "set_saturation": {
      const { h, l } = color.hsl;
      const { r, g, b } = hslToRgb(h, numeric, l);
      color.r = r;
      color.g = g;
      color.b = b;
      break;
    }
    case "saturate":
    case "desaturate": {
      const { h, s, l } = color.hsl;
      const delta = name === "saturate" ? numeric : -numeric;
      const { r, g, b } = hslToRgb(h, clamp(s + delta, 0, 100), l);
      color.r = r;
      color.g = g;
      color.b = b;
      break;
    }
    case "lighten":
    case "darken": {
      const { h, s, l } = color.hsl;
      const delta = name === "lighten" ? numeric : -numeric;
      const { r, g, b } = hslToRgb(h, s, clamp(l + delta, 0, 100));
      color.r = r;
      color.g = g;
      color.b = b;
      break;
    }
    case "auto_lightness": {
      const { h, s, l } = color.hsl;
      const direction = l < 50 ? numeric : -numeric;
      const { r, g, b } = hslToRgb(h, s, clamp(l + direction, 0, 100));
      color.r = r;
      color.g = g;
      color.b = b;
      break;
    }
    case "set_red":
      color.r = clamp(numeric, 0, 255);
      break;
    case "set_green":
      color.g = clamp(numeric, 0, 255);
      break;
    case "set_blue":
      color.b = clamp(numeric, 0, 255);
      break;
    case "blend": {
      const target = parseColorValue(args[0]);
      const amount = args[1] !== undefined ? Number(args[1]) : 1;
      if (target) {
        color.r = color.r + (target.r - color.r) * amount;
        color.g = color.g + (target.g - color.g) * amount;
        color.b = color.b + (target.b - color.b) * amount;
      }
      break;
    }
    case "harmonize": {
      const target = parseColorValue(args[0]);
      if (target) {
        const base = color.hsl;
        const targetHue = target.hsl.h;
        let diff = ((targetHue - base.h + 540) % 360) - 180;
        diff = clamp(diff, -15, 15);
        const { r, g, b } = hslToRgb(base.h + diff, base.s, base.l);
        color.r = r;
        color.g = g;
        color.b = b;
      }
      break;
    }
    default:
      return false;
  }

  color.r = Math.round(color.r);
  color.g = Math.round(color.g);
  color.b = Math.round(color.b);
  return true;
}

function splitTopLevel(value, separator) {
  const parts = [];
  let current = "";
  let quote = null;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (quote) {
      current += char;
      if (char === quote && value[i - 1] !== "\\") quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === separator) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

function parseFilterArgs(argString) {
  if (argString === undefined || argString === null) return [];

  return splitTopLevel(argString, ",").map((raw) => {
    const arg = raw.trim();
    if (
      (arg.startsWith('"') && arg.endsWith('"')) ||
      (arg.startsWith("'") && arg.endsWith("'"))
    ) {
      return arg.slice(1, -1);
    }
    if (arg === "true") return true;
    if (arg === "false") return false;
    if (arg !== "" && !Number.isNaN(Number(arg))) return Number(arg);
    return arg;
  });
}

function parseFilter(filterString) {
  const trimmed = filterString.trim();

  const colon = trimmed.match(/^([a-zA-Z_]+)\s*:\s*(.*)$/);
  if (colon) {
    return { name: colon[1], args: parseFilterArgs(colon[2]) };
  }

  const space = trimmed.match(/^([a-zA-Z_]+)\s+(.*)$/);
  if (space) {
    return { name: space[1], args: parseFilterArgs(space[2]) };
  }

  return { name: trimmed, args: [] };
}

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.vars = new Map();
  }

  set(name, value) {
    this.vars.set(name, value);
  }

  get(name) {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name);
    return undefined;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toTruthy(value) {
  if (value === undefined || value === null) return false;
  if (value === false) return false;
  if (value === true) return true;
  if (typeof value === "number") return value !== 0;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "" || normalized === "false" || normalized === "0" || normalized === "none") {
      return false;
    }
    return true;
  }

  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;

  return true;
}

export class TemplateRenderer {
  constructor(themeData, options = {}) {
    this.themeData = themeData ?? { colors: {}, palettes: {} };
    this.defaultMode = options.defaultMode ?? "dark";
    this.baseScope = options.scope ?? {};
    this.warnings = [];
  }

  render(text) {
    const trimmed = String(text).replace(STANDALONE_BLOCK_RE, "$1");
    const nodes = this._parse(trimmed);
    const scope = new Scope();
    scope.set("mode", this.defaultMode);

    for (const [key, value] of Object.entries(this.baseScope)) {
      scope.set(key, value);
    }

    return this._evalNodes(nodes, scope);
  }

  // --- Parsing -----------------------------------------------------------

  _tokenize(text) {
    const tokens = [];
    let lastIndex = 0;
    let match;
    BLOCK_RE.lastIndex = 0;

    while ((match = BLOCK_RE.exec(text)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ type: "text", value: text.slice(lastIndex, match.index) });
      }
      tokens.push({ type: "block", value: match[1].trim() });
      lastIndex = BLOCK_RE.lastIndex;
    }

    if (lastIndex < text.length) {
      tokens.push({ type: "text", value: text.slice(lastIndex) });
    }

    return tokens;
  }

  _parse(text) {
    const tokens = this._tokenize(text);
    const state = { pos: 0 };

    const parsed = this._parseNodes(tokens, state, null);
    return parsed.nodes;
  }

  _parseNodes(tokens, state, stopTags) {
    const nodes = [];

    while (state.pos < tokens.length) {
      const token = tokens[state.pos];

      if (token.type === "text") {
        nodes.push(token);
        state.pos++;
        continue;
      }

      const keyword = token.value.split(/\s+/)[0];

      if (stopTags && stopTags.includes(keyword)) {
        return { nodes, closing: keyword };
      }

      if (keyword === "for") {
        state.pos++;
        const header = token.value.match(/^for\s+(.+?)\s+in\s+(.+)$/);
        if (!header) {
          this.warnings.push(`Malformed for block: ${token.value}`);
          continue;
        }
        const vars = header[1].split(",").map((v) => v.trim());
        const iterable = header[2].trim();
        const body = this._parseNodes(tokens, state, ["endfor"]);
        if (body.closing === "endfor") state.pos++;
        nodes.push({ type: "for", vars, iterable, body: body.nodes });
        continue;
      }

      if (keyword === "if") {
        state.pos++;
        let condition = token.value.slice(keyword.length).trim();
        let negate = false;
        if (condition.startsWith("not ")) {
          negate = true;
          condition = condition.slice(4).trim();
        }
        const thenBranch = this._parseNodes(tokens, state, ["else", "endif"]);
        let elseNodes = [];

        if (thenBranch.closing === "else") {
          state.pos++;
          const elseBranch = this._parseNodes(tokens, state, ["endif"]);
          elseNodes = elseBranch.nodes;
          if (elseBranch.closing === "endif") state.pos++;
        } else if (thenBranch.closing === "endif") {
          state.pos++;
        }

        nodes.push({ type: "if", condition, negate, then: thenBranch.nodes, else: elseNodes });
        continue;
      }

      // Stray else/endif/endfor or unknown keyword: ignore.
      state.pos++;
    }

    return { nodes, closing: null };
  }

  // --- Evaluation --------------------------------------------------------

  _evalNodes(nodes, scope) {
    let output = "";

    for (const node of nodes) {
      switch (node.type) {
        case "text":
          output += this._resolveText(node.value, scope);
          break;
        case "for":
          output += this._evalFor(node, scope);
          break;
        case "if":
          output += this._evalIf(node, scope);
          break;
        default:
          break;
      }
    }

    return output;
  }

  _evalFor(node, scope) {
    const entries = this._resolveIterable(node.iterable, scope);
    let output = "";

    entries.forEach((entry, index) => {
      const child = new Scope(scope);

      if (node.vars.length >= 2) {
        child.set(node.vars[0], entry.key);
        child.set(node.vars[1], entry.value);
      } else {
        child.set(node.vars[0], entry.map ? entry.key : entry.value);
      }

      child.set("loop", {
        index,
        first: index === 0,
        last: index === entries.length - 1,
      });

      output += this._evalNodes(node.body, child);
    });

    return output;
  }

  _evalIf(node, scope) {
    const resolved = this._resolveExpression(stripExpression(node.condition), scope);
    const truthy = toTruthy(resolved);
    const branch = node.negate ? !truthy : truthy;
    return branch
      ? this._evalNodes(node.then, scope)
      : this._evalNodes(node.else, scope);
  }

  _resolveIterable(expression, scope) {
    const expr = expression.trim();

    const range = expr.match(/^(-?\d+)\s*\.\.\s*(-?\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const entries = [];
      const step = end >= start ? 1 : -1;
      for (let i = start; step > 0 ? i < end : i > end; i += step) {
        entries.push({ key: i, value: i, map: false });
      }
      return entries;
    }

    if (expr === "colors") {
      return Object.entries(this.themeData.colors).map(([key, value]) => ({
        key,
        value,
        map: true,
      }));
    }

    if (expr.startsWith("palettes.")) {
      const family = expr.slice("palettes.".length);
      const palettes = this.themeData.palettes[family] ?? {};
      const standard = [
        0, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 95, 98, 99, 100,
      ];
      return standard.map((tone) => {
        const leaf = palettes[String(tone)] ?? {};
        return {
          key: String(tone),
          value: {
            default: leaf.hex ?? "",
            dark: leaf.hex ?? "",
            light: leaf.hex ?? "",
          },
          map: false,
        };
      });
    }

    const value = this._resolveBase(expr, scope);

    if (Array.isArray(value)) {
      return value.map((item) => ({ key: undefined, value: item, map: false }));
    }

    if (isPlainObject(value)) {
      return Object.entries(value).map(([key, item]) => ({
        key,
        value: item,
        map: true,
      }));
    }

    return [];
  }

  _resolveText(text, scope) {
    return text.replace(EXPR_RE, (match, inner) => {
      const value = this._resolveExpression(inner.trim(), scope);
      if (value === undefined || value === null) return match;
      return String(value);
    });
  }

  _resolveExpression(expression, scope) {
    const segments = splitTopLevel(expression, "|").map((s) => s.trim());
    const base = segments.shift();
    let value = this._resolveBase(base, scope);

    for (const filterString of segments) {
      if (!filterString) continue;
      value = this._applyFilter(value, filterString, expression);
    }

    return value;
  }

  _resolveBase(base, scope) {
    if (base === undefined || base === "") return undefined;

    if (
      (base.startsWith('"') && base.endsWith('"')) ||
      (base.startsWith("'") && base.endsWith("'"))
    ) {
      return base.slice(1, -1);
    }

    if (/^-?\d+(\.\d+)?$/.test(base)) return Number(base);

    const path = base.split(".");
    let current;

    switch (path[0]) {
      case "colors":
        current = this.themeData.colors;
        break;
      case "palettes":
        current = this.themeData.palettes;
        break;
      default:
        current = scope.get(path[0]);
    }

    for (let i = 1; i < path.length; i++) {
      if (current === undefined || current === null) return undefined;
      const segment = path[i];
      if (Array.isArray(current)) {
        current = current[Number(segment)];
      } else if (isPlainObject(current)) {
        current = current[segment];
      } else {
        return undefined;
      }
    }

    return current;
  }

  _applyFilter(value, filterString, rawExpression) {
    const { name, args } = parseFilter(filterString);

    if (StringFilters[name]) {
      return StringFilters[name](value, args);
    }

    // `to_color` reinterprets a string as a color before color filters run.
    // Because colors are parsed lazily, this is effectively a no-op.
    if (name === "to_color") return value;

    const color = parseColorValue(value);
    if (!color) {
      this.warnings.push(
        `Filter '${name}' applied to non-color value in '{{ ${rawExpression} }}'`,
      );
      return value;
    }

    const applied = applyColorFilter(color, name, args);
    if (!applied) {
      this.warnings.push(`Unknown filter '${name}' in '{{ ${rawExpression} }}'`);
      return value;
    }

    return color.toString();
  }
}

function stripExpression(value) {
  const match = value.match(/^\{\{\s*([\s\S]*?)\s*\}\}$/);
  return match ? match[1] : value;
}
