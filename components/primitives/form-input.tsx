import type { ComponentProps } from "react";
import { mergeClassNames } from "@/utilities/merge-class-names";

export type FormControlSize = "small" | "medium" | "large";

const FORM_INPUT_BASE_CLASS_NAMES =
  "disabled:bg-surface-muted disabled:cursor-not-allowed [&[readonly]]:bg-surface-muted [&[readonly]]:cursor-not-allowed transition duration-200 ease-in-out w-full text-sm bg-field text-foreground border-line-strong shadow-xs rounded-md placeholder:text-foreground-subtle/90 focus:ring-4 focus:ring-primary/20 focus:border-primary/40 [&[type='file']]:border file:mr-4 file:py-2 file:px-4 file:rounded-l-md file:border-0 file:border-r-[1px] file:border-line/10 file:text-sm file:font-semibold file:bg-surface-muted file:text-foreground-subtle group-[.form-inline]:flex-1 group-[.input-group]:rounded-none group-[.input-group]:[&:not(:first-child)]:border-l-transparent group-[.input-group]:first:rounded-l group-[.input-group]:last:rounded-r group-[.input-group]:z-10";

/**
 * Size modifiers shared by `FormInput`, `FormTextarea` and other text controls.
 */
export const formControlSizeClassNames: Record<FormControlSize, string> = {
  small: "text-xs py-1.5 px-2",
  medium: "",
  large: "text-lg py-1.5 px-4",
};

export interface FormInputProps extends Omit<ComponentProps<"input">, "size"> {
  size?: FormControlSize;
  isRounded?: boolean;
  hasError?: boolean;
}

/**
 * A text-like input (text, email, password, number, file, …) in the template style.
 * Works in plain forms and with react-hook-form's `register()`.
 *
 * @example
 * <FormInput type="email" name="emailAddress" placeholder="example@gmail.com" />
 * <FormInput size="large" isRounded placeholder="Search…" />
 * <FormInput {...register("fullName")} hasError={Boolean(errors.fullName)} />
 */
export function FormInput({ size = "medium", isRounded = false, hasError = false, className, type = "text", ...inputAttributes }: FormInputProps) {
  return (
    <input
      type={type}
      aria-invalid={hasError || undefined}
      className={mergeClassNames(
        FORM_INPUT_BASE_CLASS_NAMES,
        formControlSizeClassNames[size],
        isRounded && "rounded-full",
        hasError && "border-danger",
        className,
      )}
      {...inputAttributes}
    />
  );
}

/**
 * Joins inputs and addons into one bordered row (the template's `.input-group`).
 *
 * @example
 * <FormInputGroup>
 *   <FormInputAddon>@</FormInputAddon>
 *   <FormInput placeholder="Username" />
 * </FormInputGroup>
 */
export function FormInputGroup({ className, ...divisionAttributes }: ComponentProps<"div">) {
  return <div className={mergeClassNames("input-group group flex", className)} {...divisionAttributes} />;
}

/**
 * A text or icon segment inside `FormInputGroup`.
 *
 * @example
 * <FormInputAddon>.00</FormInputAddon>
 */
export function FormInputAddon({ className, ...divisionAttributes }: ComponentProps<"div">) {
  return (
    <div
      className={mergeClassNames(
        "border border-line bg-surface-muted px-3 py-2 text-foreground shadow-xs group-[.input-group]:rounded-none group-[.input-group]:first:rounded-l group-[.input-group]:last:rounded-r group-[.input-group]:[&:not(:first-child)]:border-l-transparent",
        className,
      )}
      {...divisionAttributes}
    />
  );
}
