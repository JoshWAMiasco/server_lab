import type { ReactNode } from "react";
import { mergeClassNames } from "@/utilities/merge-class-names";

export interface DashboardPanelProps {
  title: ReactNode;
  actions?: ReactNode;
  titleClassName?: string;
  headerClassName?: string;
  contentClassName?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A titled dashboard block: the template's 40px heading row (title and optional right-aligned
 * actions) followed by its content, which starts 14px below the heading. Put `Card isStacked`
 * boxes in `children`; use `contentClassName` to turn the content area into a grid and
 * `headerClassName="h-10 flex-row items-center"` to keep the 40px heading on phones too.
 *
 * @example
 * <DashboardPanel title="Send Payments">
 *   <Card isStacked className="p-5">…</Card>
 * </DashboardPanel>
 *
 * @example
 * <DashboardPanel title="Wallet" contentClassName="grid grid-cols-12 gap-5" actions={<PeriodSelect ariaLabel="Wallet period" />}>
 *   {coins.map((coin) => <WalletCoinCard key={coin.symbol} coin={coin} />)}
 * </DashboardPanel>
 */
export function DashboardPanel({ title, actions, titleClassName, headerClassName, contentClassName, className, children }: DashboardPanelProps) {
  return (
    <div className={className}>
      <div className={mergeClassNames("flex flex-col gap-y-3 md:h-10 md:flex-row md:items-center", headerClassName)}>
        <div className={mergeClassNames("text-base font-medium font-display", titleClassName)}>{title}</div>
        {actions && <div className="flex flex-col gap-x-3 gap-y-2 sm:flex-row md:ml-auto">{actions}</div>}
      </div>
      <div className={mergeClassNames("mt-3.5", contentClassName)}>{children}</div>
    </div>
  );
}
