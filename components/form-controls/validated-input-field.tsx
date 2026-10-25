"use client";

import type { ReactNode } from "react";
import { useValidatedField } from "@/components/form-controls/validated-form";
import { FormField } from "@/components/primitives/form-field";
import { FormInput, type FormInputProps } from "@/components/primitives/form-input";
import { FormTextarea } from "@/components/primitives/form-textarea";
import { PasswordInput } from "@/components/primitives/password-input";

export interface ValidatedInputFieldProps extends Omit<FormInputProps, "name"> {
  fieldName: string;
  label?: ReactNode;
  helpText?: ReactNode;
  isMultiline?: boolean;
  inputClassName?: string;
}

/**
 * A labelled input (or textarea) wired to the surrounding `ValidatedForm`, showing its error inline.
 * `type="password"` renders a `PasswordInput` with a show/hide toggle.
 * `className` styles the field wrapper; `inputClassName` styles the input itself.
 *
 * @example
 * <ValidatedInputField fieldName="fullName" label="Full name" placeholder="John Doe" helpText="Required, at least 2 characters" />
 * <ValidatedInputField fieldName="comment" label="Comment" isMultiline />
 * <ValidatedInputField fieldName="emailAddress" type="email" label="Email*" className="mt-4" inputClassName="rounded-box px-4 py-3.5" />
 */
export function ValidatedInputField({ fieldName, label, helpText, isMultiline = false, inputClassName, id, className, type, ...inputAttributes }: ValidatedInputFieldProps) {
  const { registeredFieldProps, errorMessage } = useValidatedField(fieldName);
  const fieldIdentifier = id ?? `field-${fieldName}`;
  return (
    <FormField label={label} htmlFor={fieldIdentifier} helpText={helpText} errorMessage={errorMessage} className={className}>
      {isMultiline ? (
        <FormTextarea id={fieldIdentifier} className={inputClassName} hasError={Boolean(errorMessage)} placeholder={inputAttributes.placeholder} {...registeredFieldProps} />
      ) : type === "password" ? (
        <PasswordInput id={fieldIdentifier} className={inputClassName} hasError={Boolean(errorMessage)} {...inputAttributes} {...registeredFieldProps} />
      ) : (
        <FormInput id={fieldIdentifier} type={type} className={inputClassName} hasError={Boolean(errorMessage)} {...inputAttributes} {...registeredFieldProps} />
      )}
    </FormField>
  );
}
