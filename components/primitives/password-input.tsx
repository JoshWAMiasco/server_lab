"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { FormInput, type FormInputProps } from "@/components/primitives/form-input";
import { mergeClassNames } from "@/utilities/merge-class-names";

export type PasswordInputProps = Omit<FormInputProps, "type">;

/**
 * A password field with an eye button that shows or hides what was typed. Takes the same props as
 * `FormInput` (including react-hook-form's `register()` result); `className` styles the input.
 *
 * @example
 * <PasswordInput id="current-password" autoComplete="current-password" value={password} onChange={handleChange} />
 * <PasswordInput {...register("password")} hasError={Boolean(errors.password)} />
 */
export function PasswordInput({ className, disabled, ...inputAttributes }: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const toggleLabel = isVisible ? "Hide password" : "Show password";
  const ToggleIcon = isVisible ? EyeOff : Eye;
  return (
    <div className="relative group-[.form-inline]:flex-1">
      <FormInput type={isVisible ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={disabled} className={mergeClassNames(className, "pr-11")} {...inputAttributes} />
      <button
        type="button"
        onClick={() => setIsVisible((wasVisible) => !wasVisible)}
        disabled={disabled}
        aria-label={toggleLabel}
        aria-pressed={isVisible}
        title={toggleLabel}
        className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center text-foreground-subtle transition-colors hover:text-brand focus-visible:text-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ToggleIcon className="h-4 w-4 stroke-[1.5]" />
      </button>
    </div>
  );
}
