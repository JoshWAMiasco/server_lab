"use client";

import { useState } from "react";
import { z } from "zod";
import { signIn } from "@/app/actions/authentication-actions";
import { ValidatedForm } from "@/components/form-controls/validated-form";
import { ValidatedInputField } from "@/components/form-controls/validated-input-field";
import { AUTHENTICATION_INPUT_CLASS_NAMES, AUTHENTICATION_SUBMIT_BUTTON_CLASS_NAMES } from "@/components/authentication/authentication-input-styles";
import { Button } from "@/components/primitives/button";
import { FormErrorMessage } from "@/components/primitives/form-field";

const signInFormSchema = z.object({ password: z.string().min(1, "Enter the admin password") });

type SignInFormValues = z.infer<typeof signInFormSchema>;

/**
 * The admin password form. Submits to the `signIn` server action, which redirects to `nextPath`.
 *
 * @example
 * <SignInForm nextPath="/resources" />
 */
export function SignInForm({ nextPath }: { nextPath?: string }) {
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleValidSignIn(formValues: SignInFormValues) {
    setIsSubmitting(true);
    setErrorMessage(undefined);
    const result = await signIn({ password: formValues.password, nextPath });
    setIsSubmitting(false);
    if (result?.errorMessage) setErrorMessage(result.errorMessage);
  }

  return (
    <ValidatedForm schema={signInFormSchema} defaultValues={{ password: "" }} onValidSubmit={handleValidSignIn}>
      <ValidatedInputField fieldName="password" type="password" autoComplete="current-password" autoFocus label="Admin password" placeholder="************" inputClassName={AUTHENTICATION_INPUT_CLASS_NAMES} />
      <FormErrorMessage message={errorMessage} />
      <div className="mt-6 text-center xl:text-left">
        <Button type="submit" variant="primary" isRounded disabled={isSubmitting} className={AUTHENTICATION_SUBMIT_BUTTON_CLASS_NAMES}>
          {isSubmitting ? "Signing in…" : "Sign In"}
        </Button>
      </div>
    </ValidatedForm>
  );
}
