"use client";

import { ImageUp } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { uploadCustomIcon } from "@/app/actions/lobby-actions";
import { z } from "zod";
import type { ActionResult } from "@/app/actions/authentication-actions";
import { ValidatedForm, useValidatedField } from "@/components/form-controls/validated-form";
import { ValidatedInputField } from "@/components/form-controls/validated-input-field";
import { ModalBody, ModalFooter } from "@/components/interactive/modal";
import { showToastNotification } from "@/components/interactive/toast-notification";
import { CatalogIcon } from "@/components/lobby/catalog-icon";
import { Button } from "@/components/primitives/button";
import { FormErrorMessage, FormField } from "@/components/primitives/form-field";
import { FormSelect } from "@/components/primitives/form-select";

export interface IconChoice {
  iconFileName: string;
  name: string;
}

const ACCEPTED_UPLOAD_TYPES = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";

const CATEGORY_OPTIONS = [
  { label: "Application", value: "app" },
  { label: "Service", value: "service" },
  { label: "Website", value: "website" },
  { label: "Database", value: "database" },
  { label: "Infrastructure", value: "infra" },
  { label: "Monitoring", value: "monitoring" },
];

const optionalUrl = z.string().trim().refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), "Use an http:// or https:// URL");

const lobbyItemFormSchema = z.object({
  name: z.string().trim().max(80),
  description: z.string().trim().max(300),
  url: optionalUrl,
  icon: z.string(),
  category: z.string(),
  healthCheckUrl: optionalUrl,
});

type LobbyItemFormSchemaValues = z.infer<typeof lobbyItemFormSchema>;

export type LobbyItemFormSubmit = (formValues: { name: string | null; description: string | null; url: string | null; icon: string | null; category: "app" | "service" | "website" | "database" | "infra" | "monitoring" | null; healthCheckUrl: string | null }) => Promise<ActionResult>;

function SelectField({ fieldName, label, options, helpText }: { fieldName: string; label: string; options: { label: string; value: string }[]; helpText?: string }) {
  const { registeredFieldProps, errorMessage } = useValidatedField(fieldName);
  return (
    <FormField label={label} htmlFor={`field-${fieldName}`} helpText={helpText} errorMessage={errorMessage} className="mt-4">
      <FormSelect id={`field-${fieldName}`} options={options} {...registeredFieldProps} />
    </FormField>
  );
}

/**
 * The add/edit form for Lobby items. For detected items every field is optional: an empty field
 * falls back to the Docker label, catalog or detected value (shown as the placeholder). Manual
 * items need a name and can have a health check URL. The icon can be picked from the catalog,
 * from earlier uploads (`customIconChoices`) or uploaded here; with none chosen, the card keeps the
 * detected application icon.
 *
 * @example
 * <LobbyItemForm isManual iconChoices={icons} customIconChoices={uploads} detectedIconFileName={null} onSubmitValues={createManualLobbyItem} onDone={close} />
 */
export function LobbyItemForm({
  isManual,
  initialValues,
  placeholders,
  iconChoices,
  customIconChoices = [],
  detectedIconFileName = null,
  onSubmitValues,
  onDone,
}: {
  isManual: boolean;
  initialValues?: Partial<LobbyItemFormSchemaValues>;
  placeholders?: { name?: string; description?: string; url?: string };
  iconChoices: readonly IconChoice[];
  customIconChoices?: readonly IconChoice[];
  detectedIconFileName?: string | null;
  onSubmitValues: LobbyItemFormSubmit;
  onDone: () => void;
}) {
  const [errorMessage, setErrorMessage] = useState<string>();
  const [selectedIcon, setSelectedIcon] = useState(initialValues?.icon ?? "");
  const [uploadedChoices, setUploadedChoices] = useState<IconChoice[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputReference = useRef<HTMLInputElement>(null);
  const allCustomChoices = [...uploadedChoices, ...customIconChoices.filter((choice) => !uploadedChoices.some((uploaded) => uploaded.iconFileName === choice.iconFileName))];

  async function handleIconFile(changeEvent: ChangeEvent<HTMLInputElement>) {
    const file = changeEvent.target.files?.[0];
    changeEvent.target.value = "";
    if (!file) return;
    setIsUploading(true);
    setErrorMessage(undefined);
    const formData = new FormData();
    formData.append("icon", file);
    const result = await uploadCustomIcon(formData);
    setIsUploading(false);
    if (result.errorMessage || !result.iconReference) {
      setErrorMessage(result.errorMessage ?? "Upload failed.");
      return;
    }
    const iconReference = result.iconReference;
    setUploadedChoices((previous) => [{ iconFileName: iconReference, name: file.name }, ...previous.filter((choice) => choice.iconFileName !== iconReference)]);
    setSelectedIcon(iconReference);
  }

  async function handleValidSubmit(formValues: LobbyItemFormSchemaValues) {
    if (isManual && !formValues.name) {
      setErrorMessage("Give the item a name.");
      return;
    }
    const result = await onSubmitValues({
      name: formValues.name || null,
      description: formValues.description || null,
      url: formValues.url || null,
      icon: selectedIcon || null,
      category: (formValues.category || null) as Parameters<LobbyItemFormSubmit>[0]["category"],
      healthCheckUrl: formValues.healthCheckUrl || null,
    });
    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      return;
    }
    showToastNotification({ title: result.successMessage ?? "Saved." });
    onDone();
  }

  return (
    <ValidatedForm
      schema={lobbyItemFormSchema}
      defaultValues={{ name: "", description: "", url: "", icon: "", category: isManual ? "app" : "", healthCheckUrl: "", ...initialValues }}
      onValidSubmit={handleValidSubmit}
      className="flex flex-1 flex-col"
    >
      <ModalBody className="flex-1">
        <ValidatedInputField fieldName="name" label={isManual ? "Name*" : "Name"} placeholder={placeholders?.name ?? "Jellyfin"} />
        <ValidatedInputField fieldName="description" label="Short description" placeholder={placeholders?.description ?? "What it is used for"} isMultiline className="mt-4" />
        <ValidatedInputField fieldName="url" label="Open URL" placeholder={placeholders?.url ?? "https://homelab.tailnet.ts.net:8096"} helpText="Overrides the detected link." className="mt-4" />
        <SelectField fieldName="category" label="Category" options={isManual ? CATEGORY_OPTIONS : [{ label: "Detected", value: "" }, ...CATEGORY_OPTIONS]} />
        {isManual && <ValidatedInputField fieldName="healthCheckUrl" label="Health check URL" placeholder="http://127.0.0.1:8080/health" helpText="Probed every 60 s by the collector; 2xx or 3xx is up." className="mt-4" />}
        <FormField label="Icon" className="mt-4" helpText="PNG, JPEG, WebP, GIF or plain SVG, up to 512 KB. Square images look best.">
          <div className="mb-3 flex items-center gap-4">
            <CatalogIcon iconFileName={selectedIcon || detectedIconFileName} name="Selected icon" className="h-14 w-14" />
            <div className="min-w-0 flex-1 text-xs text-foreground-muted">
              {selectedIcon ? (selectedIcon.startsWith("custom:") ? "Uploaded icon" : "Catalog icon") : detectedIconFileName ? "Using the detected application icon" : "No icon: the card shows a box"}
            </div>
            <input ref={fileInputReference} type="file" accept={ACCEPTED_UPLOAD_TYPES} onChange={handleIconFile} className="hidden" aria-label="Upload icon file" />
            <Button variant="outline-secondary" size="small" disabled={isUploading} onClick={() => fileInputReference.current?.click()} leadingIcon={<ImageUp className="mr-1.5 h-4 w-4" />}>
              {isUploading ? "Uploading…" : "Upload icon"}
            </Button>
          </div>
          <div className="grid max-h-48 grid-cols-8 gap-1.5 overflow-y-auto border border-line p-2">
            <button type="button" title={detectedIconFileName ? "Detected application icon" : "No icon"} onClick={() => setSelectedIcon("")} className={`cursor-pointer border p-0.5 ${selectedIcon === "" ? "border-brand" : "border-transparent"}`}>
              <CatalogIcon iconFileName={detectedIconFileName} name="Detected" className="h-8 w-8" />
            </button>
            {[...allCustomChoices, ...iconChoices].map((iconChoice) => (
              <button key={iconChoice.iconFileName} type="button" title={iconChoice.name} onClick={() => setSelectedIcon(iconChoice.iconFileName)} className={`cursor-pointer border p-0.5 ${selectedIcon === iconChoice.iconFileName ? "border-brand" : "border-transparent"}`}>
                <CatalogIcon iconFileName={iconChoice.iconFileName} name={iconChoice.name} className="h-8 w-8 border-0 p-1" />
              </button>
            ))}
          </div>
        </FormField>
        <FormErrorMessage message={errorMessage} />
      </ModalBody>
      <ModalFooter>
        <Button variant="outline-secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </ModalFooter>
    </ValidatedForm>
  );
}
