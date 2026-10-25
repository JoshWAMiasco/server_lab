import { Copy, MoreVertical, Trash } from "lucide-react";
import { DropdownMenu, DropdownMenuItem } from "@/components/interactive/dropdown-menu";
import { mergeClassNames } from "@/utilities/merge-class-names";

export type CardOptionsMenuAppearance = "default" | "inverted";

/**
 * The three-dot "Copy Link / Delete" menu pinned to the top-right corner of a dashboard card.
 * Place it inside a relatively positioned card; use `appearance="inverted"` on colored cards.
 *
 * @example
 * <Card isStacked className="relative p-5">
 *   <CardOptionsMenu />
 *   …
 * </Card>
 */
export function CardOptionsMenu({ appearance = "default", className }: { appearance?: CardOptionsMenuAppearance; className?: string }) {
  return (
    <DropdownMenu
      className={mergeClassNames("absolute top-0 right-0 mt-5 mr-5", className)}
      triggerClassName="h-5 w-5 text-foreground-muted"
      trigger={<MoreVertical aria-label="Card options" className={mergeClassNames("h-6 w-6 stroke-[1]", appearance === "inverted" ? "fill-on-primary/70 stroke-on-primary/70" : "fill-foreground-subtle/70 stroke-foreground-subtle/70")} />}
    >
      <DropdownMenuItem icon={<Copy className="mr-2 h-4 w-4 stroke-[1]" />}>Copy Link</DropdownMenuItem>
      <DropdownMenuItem icon={<Trash className="mr-2 h-4 w-4 stroke-[1]" />}>Delete</DropdownMenuItem>
    </DropdownMenu>
  );
}
