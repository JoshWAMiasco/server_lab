"use client";

import { KeyRound, Power, UserCog } from "lucide-react";
import { signOut } from "@/app/actions/authentication-actions";
import { DropdownMenu, DropdownMenuDivider, DropdownMenuItem } from "@/components/interactive/dropdown-menu";

/**
 * The admin menu at the right of the top bar: change password and sign out.
 *
 * @example
 * <AccountMenu avatarClassName={SHELL_APPEARANCE.classNames.accountAvatarButton} />
 */
export function AccountMenu({ avatarClassName }: { avatarClassName?: string }) {
  return (
    <DropdownMenu
      className="ml-3"
      menuClassName="mt-1 w-56"
      triggerClassName={`${avatarClassName ?? ""} flex items-center justify-center bg-surface-muted`}
      trigger={<UserCog aria-label="Admin menu" className="h-4 w-4 stroke-[1.3] text-brand" />}
    >
      <div className="px-2 py-1.5">
        <div className="font-medium">admin</div>
        <div className="text-xs text-foreground-muted">ServerLab administrator</div>
      </div>
      <DropdownMenuDivider className="-mx-2" />
      <DropdownMenuItem href="/settings#password" icon={<KeyRound className="mr-2 h-4 w-4 stroke-[1]" />}>
        Change password
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void signOut()} icon={<Power className="mr-2 h-4 w-4 stroke-[1]" />}>
        Sign out
      </DropdownMenuItem>
    </DropdownMenu>
  );
}
