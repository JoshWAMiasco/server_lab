import { Tab, TabList } from "@/components/interactive/tabs";
import { mergeClassNames } from "@/utilities/merge-class-names";

/**
 * The segmented "Daily / Monthly / Yearly" switch used in dashboard headers. Render it inside
 * `<Tabs variant="pills">` and give the matching `TabPanel`s the content for each period.
 *
 * @example
 * <Tabs variant="pills">
 *   <PeriodTabList className="md:ml-auto" />
 *   <TabPanels>{periods.map((period) => <TabPanel key={period}>…</TabPanel>)}</TabPanels>
 * </Tabs>
 */
export function PeriodTabList({ periodLabels = ["Daily", "Monthly", "Yearly"], className, tabClassName }: { periodLabels?: readonly string[]; className?: string; tabClassName?: string }) {
  return (
    <TabList className={mergeClassNames("w-auto rounded-box border-line bg-surface p-0.5 shadow-xs", className)}>
      {periodLabels.map((periodLabel) => (
        <Tab
          key={periodLabel}
          className={mergeClassNames(
            "rounded-none bg-surface-subtle whitespace-nowrap text-foreground-muted first:rounded-l-box last:rounded-r-box data-selected:rounded-box",
            tabClassName,
          )}
        >
          {periodLabel}
        </Tab>
      ))}
    </TabList>
  );
}
