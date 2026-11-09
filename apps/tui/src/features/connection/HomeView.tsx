import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { Box, usePaste } from "ink";
import { useContext, useState } from "react";

import { Text } from "../../app/text.tsx";
import type { TuiViewProps } from "../../app/feature.ts";
import { toPairingUrl } from "../../cli.ts";
import { connectPairingUrl, environmentCatalog } from "../../state/catalog.ts";
import { serverHintAtom } from "../../state/serverHint.ts";
import { theme } from "../../theme/theme.ts";

type PairingState =
  | { readonly status: "idle" }
  | { readonly status: "pairing" }
  | { readonly status: "failed"; readonly message: string };

/** Without a paired server, a pasted pairing URL connects one. */
export function HomeView({ focused }: TuiViewProps) {
  const registry = useContext(RegistryContext);
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const serverHint = useAtomValue(serverHintAtom);
  const [pairing, setPairing] = useState<PairingState>({ status: "idle" });
  const unpaired = catalog.isReady && catalog.entries.size === 0;

  usePaste(
    (text) => {
      setPairing({ status: "pairing" });
      void runAtomCommand(
        registry,
        connectPairingUrl,
        { pairingUrl: toPairingUrl(text, serverHint) },
        {
          reportFailure: false,
        },
      ).then((result) =>
        setPairing(
          AsyncResult.isSuccess(result)
            ? { status: "idle" }
            : { status: "failed", message: Cause.pretty(result.cause).split("\n")[0] ?? "" },
        ),
      );
    },
    { isActive: focused && unpaired && pairing.status !== "pairing" },
  );

  if (!unpaired) return <Text color={theme.textFaint}>Select a thread in the sidebar.</Text>;
  return (
    <Box flexDirection="column" gap={1}>
      <Text color={theme.text} bold>
        Pair with a T3 Code server
      </Text>
      {serverHint !== null && (
        <Text color={theme.text}>
          Server to pair with: <Text color={theme.accent}>{serverHint}</Text>
        </Text>
      )}
      <Text color={theme.textMuted}>
        On the server, open Settings › Connections and create a pairing link, or run `t3 pair`.
      </Text>
      <Text color={theme.textMuted}>Focus this pane and paste the pairing link or code.</Text>
      {pairing.status === "pairing" && <Text color={theme.warning}>Pairing…</Text>}
      {pairing.status === "failed" && <Text color={theme.danger}>{pairing.message}</Text>}
    </Box>
  );
}
