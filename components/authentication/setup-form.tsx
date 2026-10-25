"use client";

import { useState } from "react";
import { z } from "zod";
import { completeSetup } from "@/app/actions/authentication-actions";
import { ValidatedForm } from "@/components/form-controls/validated-form";
import { ValidatedInputField } from "@/components/form-controls/validated-input-field";
import { AUTHENTICATION_INPUT_CLASS_NAMES, AUTHENTICATION_SUBMIT_BUTTON_CLASS_NAMES } from "@/components/authentication/authentication-input-styles";
import { Button } from "@/components/primitives/button";
import { FormErrorMessage } from "@/components/primitives/form-field";

const MINIMUM_PASSWORD_LENGTH = 12;

const setupFormSchema = z
  .object({
    setupToken: z.string().min(1, "Paste the token printed by install.sh"),
    password: z.string().min(MINIMUM_PASSWORD_LENGTH, `Use at least ${MINIMUM_PASSWORD_LENGTH} characters`),
    passwordConfirmation: z.string(),
  })
  .refine((formValues) => formValues.password === formValues.passwordConfirmation, { message: "Passwords do not match", path: ["passwordConfirmation"] });

type SetupFormValues = z.infer<typeof setupFormSchema>;

/**
 * First-run form: the one-time setup token and the new admin password.
 *
 * @example
 * <SetupForm />
 */
export function SetupForm() {
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleValidSetup(formValues: SetupFormValues) {
    setIsSubmitting(true);
    setErrorMessage(undefined);
    const result = await completeSetup(formValues);
    setIsSubmitting(false);
    if (result?.errorMessage) setErrorMessage(result.errorMessage);
  }

  return (
    <ValidatedForm schema={setupFormSchema} defaultValues={{ setupToken: "", password: "", passwordConfirmation: "" }} onValidSubmit={handleValidSetup}>
      <ValidatedInputField fieldName="setupToken" autoComplete="off" label="Setup token" helpText="Printed by install.sh and stored in /var/lib/serverlab/setup-token." inputClassName={AUTHENTICATION_INPUT_CLASS_NAMES} />
      <ValidatedInputField fieldName="password" type="password" autoComplete="new-password" label="Admin password" helpText={`At least ${MINIMUM_PASSWORD_LENGTH} characters.`} className="mt-4" inputClassName={AUTHENTICATION_INPUT_CLASS_NAMES} />
      <ValidatedInputField fieldName="passwordConfirmation" type="password" autoComplete="new-password" label="Confirm password" className="mt-4" inputClassName={AUTHENTICATION_INPUT_CLASS_NAMES} />
      <FormErrorMessage message={errorMessage} />
      <div className="mt-6 text-center xl:text-left">
        <Button type="submit" variant="primary" isRounded disabled={isSubmitting} className={AUTHENTICATION_SUBMIT_BUTTON_CLASS_NAMES}>
          {isSubmitting ? "Creating…" : "Create admin"}
        </Button>
      </div>
    </ValidatedForm>
  );
}
