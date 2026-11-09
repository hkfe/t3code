import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import {
  WS_METHODS,
  type EnvironmentId,
  type OrchestrationProjectShell,
  type ProjectId,
  type ThreadEnvMode,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";

import { connectionAtomRuntime } from "../../connection/runtime.ts";
import { environmentCatalog } from "../../state/catalog.ts";
import { serverEnvironment } from "../../state/settings.ts";
import { environmentShell } from "../../state/shell.ts";
import { canOperateAtom } from "./actions.ts";

export const NEW_THREAD_OVERLAY = "thread-actions.new";

/** A project to start in. `projectId: null` is "No project": the server's scratch folder. */
export interface NewThreadTarget {
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId | null;
  readonly label: string;
  readonly defaultEnvMode: ThreadEnvMode;
  /** Without the operate scope this client cannot start threads there. */
  readonly disabled: boolean;
}

interface EnvironmentProjects {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly projects: ReadonlyArray<OrchestrationProjectShell>;
  readonly scratchWorkspaceRoot: string | null;
  readonly canOperate: boolean;
}

/** "No project" first, then pinned projects, then the rest by title. Archived projects stay out. */
export function newThreadTargets(
  environments: ReadonlyArray<EnvironmentProjects>,
): ReadonlyArray<NewThreadTarget> {
  const suffix = (environment: EnvironmentProjects) =>
    environments.length > 1 ? ` · ${environment.label}` : "";
  const scratch = environments.flatMap((environment) =>
    environment.scratchWorkspaceRoot === null
      ? []
      : [
          {
            key: `${environment.environmentId}:scratch`,
            environmentId: environment.environmentId,
            projectId: null,
            label: `No project${suffix(environment)}`,
            defaultEnvMode: "local" as const,
            disabled: !environment.canOperate,
          },
        ],
  );
  const projects = environments
    .flatMap((environment) =>
      environment.projects
        .filter(
          (project) =>
            project.archivedAt == null &&
            !isScratchProject(project, environment.scratchWorkspaceRoot),
        )
        .map((project) => ({ environment, project })),
    )
    .toSorted(
      (a, b) =>
        Number(b.project.pinnedAt != null) - Number(a.project.pinnedAt != null) ||
        a.project.title.localeCompare(b.project.title),
    )
    .map(({ environment, project }) => ({
      key: `${environment.environmentId}:${project.id}`,
      environmentId: environment.environmentId,
      projectId: project.id,
      label: `${project.title}${suffix(environment)}`,
      defaultEnvMode: project.defaultThreadEnvMode ?? ("local" as const),
      disabled: !environment.canOperate,
    }));
  return [...scratch, ...projects];
}

export const newThreadTargetsAtom = Atom.make((get) => {
  const environments: EnvironmentProjects[] = [];
  for (const environmentId of enabledEnvironmentIds(get(environmentCatalog.catalogValueAtom))) {
    const snapshot = get(environmentShell.stateValueAtom(environmentId)).snapshot;
    if (Option.isNone(snapshot)) continue;
    const config = get(serverEnvironment.configValueAtom(environmentId));
    environments.push({
      environmentId,
      label: config?.environment.label ?? environmentId,
      projects: snapshot.value.projects,
      scratchWorkspaceRoot: config?.scratchWorkspaceRoot ?? null,
      canOperate: get(canOperateAtom(environmentId)),
    });
  }
  return newThreadTargets(environments);
}).pipe(Atom.withLabel("tui-new-thread-targets"));

/** Makes (or finds) the environment's scratch project for a "No project" thread. */
export const ensureScratchProject = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "tui:projects:ensure-scratch",
  tag: WS_METHODS.projectsEnsureScratch,
});
