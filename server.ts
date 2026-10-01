// bb-plugin-chat-sidebar — backend. The list lives in the frontend; the
// backend only declares the settings bb shows on the plugin's page.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { SETTINGS } from "./lib/settings";

export default function plugin(bb: BbPluginApi) {
  bb.settings.define(SETTINGS);
}
