/*
 * appThemingPage.js
 *
 * This file is part of Kaleido GNOME Shell Extension.
 * https://github.com/thatmechguy/Kaleido
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Adw from "gi://Adw";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import { _ } from "../kaleido.js";
import { loadCatalogSync } from "../utils/appThemeUtils.js";

const extensionPath = (() => {
  const url = import.meta.url;
  if (url.startsWith("file://")) {
    return Gio.File.new_for_uri(url).get_parent().get_parent().get_path();
  }
  return GLib.get_current_dir();
})();

const CATEGORY_TITLES = {
  ai: "AI",
  audio: "Audio",
  browser: "Browsers",
  chat: "Chat",
  compositor: "Compositors",
  editor: "Editors",
  gaming: "Gaming",
  launcher: "Launchers",
  system: "System",
  terminal: "Terminals",
  misc: "Miscellaneous",
};

export class AppThemingPage extends Adw.PreferencesPage {
  static {
    GObject.registerClass(this);
  }

  constructor(settings) {
    super({
      title: _("App Theming"),
      icon_name: "application-x-executable-symbolic",
    });

    this._settings = settings;
    this._build();
  }

  _build() {
    const intro = new Adw.PreferencesGroup({
      title: _("App Theming"),
      description: _(
        "Render the active palette into other applications using the template catalog. Each app writes a dedicated theme file; a few also add an include line to the app's own configuration.",
      ),
    });
    this.add(intro);

    const enableRow = new Adw.SwitchRow({
      title: _("Enable app theming"),
      subtitle: _("Apply the palette to the templates enabled below"),
    });
    this._settings.bind(
      "app-theming",
      enableRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    intro.add(enableRow);

    const catalog = loadCatalogSync(extensionPath);

    if (catalog.templates.length === 0) {
      const emptyGroup = new Adw.PreferencesGroup();
      emptyGroup.add(
        new Adw.ActionRow({
          title: _("No templates found"),
          subtitle: _("The app template catalog could not be loaded."),
        }),
      );
      this.add(emptyGroup);
      return;
    }

    const groups = new Map();

    for (const template of catalog.templates) {
      const category = template.category ?? "misc";

      if (!groups.has(category)) {
        const group = new Adw.PreferencesGroup({
          title: _(CATEGORY_TITLES[category] ?? CATEGORY_TITLES.misc),
        });
        this.add(group);
        groups.set(category, group);
      }

      const row = new Adw.SwitchRow({
        title: template.name,
        subtitle: template.description ?? "",
      });

      row.active = this._settings
        .get_strv("app-theming-templates")
        .includes(template.id);

      row.connect("notify::active", () => {
        this._setEnabled(template.id, row.active);
      });

      groups.get(category).add(row);
    }
  }

  _setEnabled(id, enabled) {
    const current = new Set(
      this._settings.get_strv("app-theming-templates"),
    );

    if (enabled) current.add(id);
    else current.delete(id);

    this._settings.set_strv("app-theming-templates", [...current]);
  }
}
