"use client";

import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestSecurityAction } from "@/app/actions/security-actions";
import { Modal, ModalBody, ModalFooter } from "@/components/interactive/modal";
import { showToastNotification } from "@/components/interactive/toast-notification";
import { Button } from "@/components/primitives/button";
import { FormCheckbox } from "@/components/primitives/form-check";
import { CommandLabel } from "@/components/security/command-label";
import { buildActionCommands, formatCommandLine } from "@/lib/security/security-commands";
import type { SecurityAction } from "@/lib/security/security-types";

type ChangeAction = Exclude<SecurityAction, { kind: "snapshot" }>;

export interface PendingLockout {
  action: ChangeAction;
  reason: string;
  onQueued?: () => void;
}

const FOLLOW_UP_REFRESH_DELAYS = [1500, 4000, 9000, 20_000];

/**
 * Sends firewall and fail2ban changes to the server, shows a toast with the queued command, and
 * refreshes the page a few times while the collector carries the change out. A change that could
 * lock the admin out comes back as `pendingLockout`; render `LockoutConfirmation` for it.
 *
 * @example
 * const runner = useSecurityActionRunner();
 * runner.run({ kind: "firewall-disable" });
 * <LockoutConfirmation runner={runner} />
 */
export function useSecurityActionRunner() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [pendingLockout, setPendingLockout] = useState<PendingLockout | null>(null);

  const run = (action: ChangeAction, { confirmLockoutRisk = false, onQueued }: { confirmLockoutRisk?: boolean; onQueued?: () => void } = {}) =>
    startTransition(async () => {
      setErrorMessage(undefined);
      const result = await requestSecurityAction(action, { confirmLockoutRisk });
      if (result.lockoutReason) {
        setPendingLockout({ action, reason: result.lockoutReason, onQueued });
        return;
      }
      setPendingLockout(null);
      if (result.errorMessage) {
        setErrorMessage(result.errorMessage);
        showToastNotification({ title: "Not changed", description: result.errorMessage, durationInMilliseconds: 6000 });
        return;
      }
      showToastNotification({ title: "Change queued", description: result.successMessage });
      onQueued?.();
      router.refresh();
      for (const delay of FOLLOW_UP_REFRESH_DELAYS) window.setTimeout(() => router.refresh(), delay);
    });

  return { run, isPending, errorMessage, pendingLockout, dismissLockout: () => setPendingLockout(null) };
}

export type SecurityActionRunner = ReturnType<typeof useSecurityActionRunner>;

/**
 * Asks the admin to confirm a change the lockout guard stopped, explaining what would be cut off.
 * The confirm button stays disabled until they tick that they have another way in.
 *
 * @example
 * <LockoutConfirmation runner={runner} />
 */
export function LockoutConfirmation({ runner }: { runner: SecurityActionRunner }) {
  const [hasOtherAccess, setHasOtherAccess] = useState(false);
  const { pendingLockout } = runner;
  const close = () => {
    setHasOtherAccess(false);
    runner.dismissLockout();
  };
  return (
    <Modal isOpen={pendingLockout !== null} onOpenChange={(isOpen) => !isOpen && close()} title="This could lock you out" size="medium">
      <ModalBody className="grid gap-4">
        <div className="flex gap-3 text-warning">
          <TriangleAlert className="mt-0.5 h-5 w-5 flex-none" />
          <p className="leading-relaxed">{pendingLockout?.reason}</p>
        </div>
        {pendingLockout && <CommandLabel command={buildActionCommands(pendingLockout.action).map((command) => formatCommandLine(command)).join(" && ")} />}
        <p className="text-foreground-muted">Safer: add a rule first, for example the one below, then try again.</p>
        <CommandLabel command="sudo ufw allow in on tailscale0" caption="Allows everything that arrives over Tailscale, which is how you reach ServerLab." />
        <FormCheckbox id="confirm-other-access" label="I can reach this server another way (a local console, KVM or IPMI)" checked={hasOtherAccess} onChange={(changeEvent) => setHasOtherAccess(changeEvent.target.checked)} />
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button variant="outline-secondary" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={!hasOtherAccess || runner.isPending}
          onClick={() => {
            if (!pendingLockout) return;
            runner.run(pendingLockout.action, { confirmLockoutRisk: true, onQueued: pendingLockout.onQueued });
            setHasOtherAccess(false);
          }}
        >
          Run it anyway
        </Button>
      </ModalFooter>
    </Modal>
  );
}
