/*
 * appThemeUtils.js
 *
 * This file is part of Kaleido GNOME Shell Extension.
 * https://github.com/thatmechguy/Kaleido
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * Applies the active palette to third-party applications through a catalog of
 * Noctalia v5 / matugen-compatible templates.
 *
 * The catalog lives in <extension>/app-templates/manifest.json and lists each
 * template with an input file, one or more output paths, an optional
 * `requires` guard and an optional `post_hook`.
 */

import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { TemplateRenderer } from "./templateEngine.js";
import { isCancelledError } from "./cancellation.js";

const CATALOG_FILE = "app-templates/manifest.json";
const TEMPLATES_DIR = "app-templates";

function expandPath(value) {
  const home = GLib.get_home_dir();
  const stateHome = GLib.getenv("XDG_STATE_HOME") ?? `${home}/.local/state`;

  return String(value)
    .replace(/^\$XDG_CONFIG_HOME/, GLib.get_user_config_dir())
    .replace(/^\$XDG_DATA_HOME/, GLib.get_user_data_dir())
    .replace(/^\$XDG_CACHE_HOME/, GLib.get_user_cache_dir())
    .replace(/^\$XDG_STATE_HOME/, stateHome)
    .replace(/^~/, home);
}

function loadContents(path, cancellable) {
  return new Promise((resolve, reject) => {
    const file = Gio.File.new_for_path(path);

    file.load_contents_async(cancellable, (obj, res) => {
      try {
        const [, contents] = obj.load_contents_finish(res);
        resolve(new TextDecoder().decode(contents));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function loadContentsSync(path) {
  const file = Gio.File.new_for_path(path);
  if (!file.query_exists(null)) return null;
  try {
    const [, contents] = file.load_contents(null);
    return new TextDecoder().decode(contents);
  } catch (e) {
    return null;
  }
}

function writeIfChanged(path, contents, cancellable) {
  return new Promise((resolve, reject) => {
    const file = Gio.File.new_for_path(path);

    const existing = loadContentsSync(path);
    if (existing === contents) {
      resolve(false);
      return;
    }

    const parent = file.get_parent();
    if (parent && !parent.query_exists(null)) {
      parent.make_directory_with_parents(null);
    }

    const bytes = new GLib.Bytes(new TextEncoder().encode(contents));

    file.replace_contents_bytes_async(
      bytes,
      null,
      false,
      Gio.FileCreateFlags.NONE,
      cancellable,
      (obj, res) => {
        try {
          obj.replace_contents_finish(res);
          resolve(true);
        } catch (e) {
          reject(e);
        }
      },
    );
  });
}

function runCommand(command, cancellable) {
  return new Promise((resolve, reject) => {
    let proc;

    try {
      const launcher = new Gio.SubprocessLauncher({
        flags: Gio.SubprocessFlags.NONE,
      });
      launcher.set_cwd(GLib.get_home_dir());
      proc = launcher.spawnv(["bash", "-c", command]);
    } catch (e) {
      reject(e);
      return;
    }

    proc.wait_async(cancellable, (p, res) => {
      try {
        p.wait_finish(res);
        resolve(p.get_successful());
      } catch (e) {
        reject(e);
      }
    });
  });
}

export function loadCatalogSync(extensionPath) {
  const raw = loadContentsSync(`${extensionPath}/${CATALOG_FILE}`);
  if (!raw) return { version: 1, templates: [] };

  try {
    const catalog = JSON.parse(raw);
    catalog.templates ??= [];
    return catalog;
  } catch (e) {
    return { version: 1, templates: [], error: e.message };
  }
}

export async function loadCatalog(extensionPath, cancellable = null) {
  try {
    const raw = await loadContents(`${extensionPath}/${CATALOG_FILE}`, cancellable);
    const catalog = JSON.parse(raw);
    catalog.templates ??= [];
    return catalog;
  } catch (e) {
    if (isCancelledError(e)) throw e;
    return { version: 1, templates: [], error: e.message };
  }
}

/*
 * Renders every enabled template and writes the result if it changed.
 * Returns a per-template result array for diagnostics.
 */
export async function applyAppTemplates({
  extensionPath,
  themeData,
  mode,
  enabledIds = [],
  image = "",
  cancellable = null,
}) {
  const catalog = await loadCatalog(extensionPath, cancellable);
  const templatesDir = `${extensionPath}/${TEMPLATES_DIR}`;

  const renderer = new TemplateRenderer(themeData, {
    defaultMode: mode,
    scope: {
      mode,
      image,
      config_dir: templatesDir,
    },
  });

  const results = [];

  for (const template of catalog.templates) {
    if (!enabledIds.includes(template.id)) continue;

    try {
      if (
        template.requires &&
        !Gio.File.new_for_path(expandPath(template.requires)).query_exists(null)
      ) {
        results.push({ id: template.id, skipped: "requires" });
        continue;
      }

      const source = await loadContents(
        `${templatesDir}/${template.input}`,
        cancellable,
      );

      const rendered = renderer.render(source);
      const outputs = Array.isArray(template.output)
        ? template.output
        : [template.output];

      let wrote = false;
      for (const output of outputs) {
        if (await writeIfChanged(expandPath(output), rendered, cancellable)) {
          wrote = true;
        }
      }

      if (template.post_hook) {
        const hook = renderer.render(template.post_hook);
        await runCommand(hook, cancellable);
      }

      results.push({ id: template.id, wrote });
    } catch (e) {
      if (isCancelledError(e)) throw e;
      results.push({ id: template.id, error: e.message ?? String(e) });
    }
  }

  return results;
}
