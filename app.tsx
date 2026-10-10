// bb-plugin-chat-sidebar — frontend. Replaces the sidebar's thread list with
// a messenger-style chat list. Everything else in the sidebar (New thread,
// the navigation rail, the footer) stays bb's.
import "./app.css";
import { definePluginApp } from "@get-bb/plugin-sdk/app";

import { ChatList } from "./components/chat-list";
import { addToFolderAction, registerMenuIcons } from "./components/thread-actions";

export default definePluginApp((app) => {
  registerMenuIcons(app);
  app.slots.experimental_threadAction(addToFolderAction);
  app.slots.experimental_threadList({
    id: "chats",
    title: "Chats",
    description: "A messenger chat list: folders for what needs you, projects and sections, search, live status.",
    component: ChatList,
  });
});
