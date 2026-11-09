import {
  createEnvironmentProjectAtoms,
  createProjectEnvironmentAtoms,
} from "@t3tools/client-runtime/state/projects";
import { createEnvironmentSnapshotAtom } from "@t3tools/client-runtime/state/shell";
import { createVcsEnvironmentAtoms } from "@t3tools/client-runtime/state/vcs";

import { connectionAtomRuntime } from "../connection/runtime.ts";
import { environmentCatalog } from "./catalog.ts";
import { serverEnvironment } from "./settings.ts";
import { environmentShell } from "./shell.ts";

/** Projects of every enabled environment (`projectsAtom`, `projectAtom(ref)`), as on mobile. */
export const environmentProjects = createEnvironmentProjectAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  snapshotAtom: createEnvironmentSnapshotAtom(environmentShell.stateAtom),
  serverConfigValueAtom: serverEnvironment.configValueAtom,
});

/** Project mutations: create, update (title, pin, scripts, default model), delete. */
export const projectEnvironment = createProjectEnvironmentAtoms(connectionAtomRuntime, {
  projectAtom: environmentProjects.projectAtom,
});

/** Git status per `{ environmentId, input: { cwd } }`, worktree create and refresh. */
export const vcsEnvironment = createVcsEnvironmentAtoms(connectionAtomRuntime);
