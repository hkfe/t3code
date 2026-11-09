import type { KeyContext, TuiFeature } from "../../app/feature.ts";
import { focusAtom, layoutAtom, overlayAtom } from "../../state/ui.ts";
import { ProjectsOverlay } from "./ProjectsOverlay.tsx";
import { GitStatusItem, WorkspacePanel } from "./workspace.tsx";

const OVERLAY = "projects";
const PANEL = "projects.workspace";
const noOverlay = ({ overlay }: KeyContext) => overlay === null;

export const projectsFeature: TuiFeature = {
  id: "projects",
  commands: [
    {
      id: "projects.open",
      title: "Projects…",
      run: ({ registry }) => registry.set(overlayAtom, OVERLAY),
    },
    {
      id: "projects.workspace",
      title: "Toggle thread workspace (branch, worktree, git status)",
      run: ({ registry }) => {
        const layout = registry.get(layoutAtom);
        const open = layout.panel !== PANEL;
        registry.set(layoutAtom, { ...layout, panel: open ? PANEL : null });
        registry.set(focusAtom, open ? "panel" : "main");
      },
    },
  ],
  keybindings: [
    { key: "alt+p", command: "projects.open", when: noOverlay },
    { key: "alt+g", command: "projects.workspace", when: noOverlay },
  ],
  overlays: [{ id: OVERLAY, component: ProjectsOverlay }],
  panels: [{ id: PANEL, title: "Workspace", component: WorkspacePanel }],
  statusItems: [{ id: "projects.git", align: "left", component: GitStatusItem }],
};
