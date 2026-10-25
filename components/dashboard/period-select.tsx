import { CalendarCheck2 } from "lucide-react";
import { FormSelect } from "@/components/primitives/form-select";
import { mergeClassNames } from "@/utilities/merge-class-names";

const REPORT_PERIODS = ["Daily", "Weekly", "Monthly", "Yearly"] as const;

/**
 * The calendar-icon select for choosing a report period (Daily, Weekly, Monthly, Yearly), with an
 * optional leading "Custom Date" choice. Width is set with `className` (e.g. `sm:w-32`).
 *
 * @example
 * <PeriodSelect ariaLabel="Patient overview period" className="sm:w-32" />
 * <PeriodSelect ariaLabel="Report period" includesCustomDate className="sm:w-44" />
 */
export function PeriodSelect({ ariaLabel, includesCustomDate = false, className }: { ariaLabel: string; includesCustomDate?: boolean; className?: string }) {
  const periodOptions = [...(includesCustomDate ? ["Custom Date"] : []), ...REPORT_PERIODS].map((periodLabel) => ({ label: periodLabel, value: periodLabel.toLowerCase().replace(" ", "-") }));
  return (
    <div className={mergeClassNames("relative", className)}>
      <CalendarCheck2 className="absolute inset-y-0 left-0 z-10 my-auto ml-3 h-4 w-4 stroke-[1.3]" />
      <FormSelect aria-label={ariaLabel} options={periodOptions} className="rounded-box pl-9" />
    </div>
  );
}
