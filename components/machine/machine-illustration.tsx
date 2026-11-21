"use client";

import { FormFactorLaptop } from "@/components/machine/form-factor-laptop";
import { FormFactorMini } from "@/components/machine/form-factor-mini";
import { FormFactorServer } from "@/components/machine/form-factor-server";
import { FormFactorTower } from "@/components/machine/form-factor-tower";
import type { FormFactorProperties } from "@/components/machine/machine-svg-parts";
import { mergeClassNames } from "@/utilities/merge-class-names";

const LEGEND = [
  { label: "CPU", className: "bg-surface-strong border-foreground-subtle" },
  { label: "Memory", className: "bg-info/20 border-info" },
  { label: "NVIDIA", className: "bg-success/15 border-success" },
  { label: "AMD", className: "bg-danger/15 border-danger" },
  { label: "Intel", className: "bg-info/15 border-info" },
  { label: "NVMe", className: "bg-pending/20 border-pending" },
] as const;

/**
 * The "inside the machine" drawing, picked by form factor: tower (desktop, all-in-one, unknown),
 * laptop, mini PC or rack server, followed by a small colour legend.
 *
 * @example
 * <MachineIllustration inventory={inventory} model={model} sample={sample} />
 */
export function MachineIllustration(properties: FormFactorProperties) {
  const formFactor = properties.inventory.formFactor;
  return (
    <div>
      {formFactor === "laptop" && <FormFactorLaptop {...properties} />}
      {formFactor === "mini" && <FormFactorMini {...properties} />}
      {formFactor === "server" && <FormFactorServer {...properties} />}
      {formFactor !== "laptop" && formFactor !== "mini" && formFactor !== "server" && (
        <FormFactorTower {...properties} />
      )}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-foreground-muted">
        {LEGEND.map((entry) => (
          <span key={entry.label} className="inline-flex items-center gap-1.5">
            <span className={mergeClassNames("inline-block h-2.5 w-2.5 rounded-xs border", entry.className)} />
            {entry.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-success" />
          Disk activity / link up
        </span>
      </div>
    </div>
  );
}
