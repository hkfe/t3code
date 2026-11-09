import type { EnvironmentId } from "@t3tools/contracts";

import { appAtomRegistry } from "../rpc/atomRegistry";
import { serverEnvironment } from "../state/server";

/** The thread menu's Labels choices, read from the environment's settings when the menu opens. */
export function resolveThreadLabelMenu(
  environmentId: EnvironmentId,
  tags: ReadonlyArray<string> | undefined,
) {
  const labels = appAtomRegistry.get(
    serverEnvironment.settingsValueAtom(environmentId),
  )?.threadLabels;
  return (labels ?? []).map((label) => ({
    id: label.id,
    name: label.name,
    checked: tags?.includes(label.id) === true,
  }));
}
