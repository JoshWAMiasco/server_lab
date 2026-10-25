"use client";

import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { Check, ChevronDown, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { mergeClassNames } from "@/utilities/merge-class-names";

export interface SearchableSelectOption {
  label: string;
  value: string;
  groupLabel?: string;
  isDisabled?: boolean;
}

interface SearchableSelectBaseProps {
  options: readonly SearchableSelectOption[];
  name?: string;
  placeholder?: string;
  allowsCreate?: boolean;
  isDisabled?: boolean;
  renderOption?: (option: SearchableSelectOption) => ReactNode;
  className?: string;
}

export interface SingleSearchableSelectProps extends SearchableSelectBaseProps {
  isMultiple?: false;
  defaultValue?: string;
  value?: string | null;
  onValueChange?: (selectedValue: string | null) => void;
}

export interface MultipleSearchableSelectProps extends SearchableSelectBaseProps {
  isMultiple: true;
  defaultValue?: readonly string[];
  value?: readonly string[];
  onValueChange?: (selectedValues: string[]) => void;
  maximumSelections?: number;
}

export type SearchableSelectProps = SingleSearchableSelectProps | MultipleSearchableSelectProps;

const CONTROL_CLASS_NAMES =
  "flex min-h-[38px] w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md border border-line bg-surface py-1 pr-8 pl-3 text-sm shadow-xs transition duration-200 focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/20";

/**
 * A select with type-to-filter search, optional multiple selection and creatable options
 * (replaces the template's Tom Select). With `name` it submits through native forms
 * (one hidden input per selected value).
 *
 * @example
 * <SearchableSelect name="favoriteActor" placeholder="Select an actor" options={[
 *   { label: "Leonardo Donovan", value: "leonardo-donovan" },
 *   { label: "Sofia Marquez", value: "sofia-marquez" },
 * ]} />
 *
 * @example
 * <SearchableSelect isMultiple allowsCreate maximumSelections={3} name="tags" options={tagOptions} defaultValue={["design"]} />
 */
export function SearchableSelect(searchableSelectProps: SearchableSelectProps) {
  const { options, name, placeholder = "Select an option", allowsCreate = false, isDisabled = false, renderOption, className } = searchableSelectProps;
  const [searchQuery, setSearchQuery] = useState("");
  const [createdOptions, setCreatedOptions] = useState<SearchableSelectOption[]>([]);
  const [uncontrolledSingleValue, setUncontrolledSingleValue] = useState<string | null>(!searchableSelectProps.isMultiple ? (searchableSelectProps.defaultValue ?? null) : null);
  const [uncontrolledMultipleValues, setUncontrolledMultipleValues] = useState<string[]>(searchableSelectProps.isMultiple ? [...(searchableSelectProps.defaultValue ?? [])] : []);

  const allOptions = [...options, ...createdOptions];
  const findOption = (optionValue: string) => allOptions.find((option) => option.value === optionValue);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredOptions = normalizedQuery ? allOptions.filter((option) => option.label.toLowerCase().includes(normalizedQuery)) : allOptions;
  const canCreateFromQuery = allowsCreate && normalizedQuery !== "" && !allOptions.some((option) => option.label.toLowerCase() === normalizedQuery);

  const createOptionFromQuery = (): string => {
    const createdOption = { label: searchQuery.trim(), value: searchQuery.trim().toLowerCase().replace(/\s+/g, "-") };
    setCreatedOptions((currentOptions) => [...currentOptions, createdOption]);
    return createdOption.value;
  };

  const optionList = (
    <ComboboxOptions anchor={{ to: "bottom start", gap: 4 }} className="z-50 max-h-60 w-(--input-width) overflow-auto rounded-md border border-line-strong bg-surface-muted py-1 text-sm shadow-overlay empty:invisible">
      {canCreateFromQuery && (
        <ComboboxOption value={`__create__${searchQuery}`} className="cursor-pointer px-3 py-2 data-focus:bg-surface-muted">
          Add <span className="font-medium">{searchQuery.trim()}</span>…
        </ComboboxOption>
      )}
      {filteredOptions.map((option) => (
        <ComboboxOption key={option.value} value={option.value} disabled={option.isDisabled} className="group flex cursor-pointer items-center px-3 py-2 data-disabled:opacity-50 data-focus:bg-surface-muted">
          <span className="flex-1">{renderOption ? renderOption(option) : option.label}</span>
          <Check className="invisible h-4 w-4 text-primary group-data-selected:visible" />
        </ComboboxOption>
      ))}
    </ComboboxOptions>
  );

  if (searchableSelectProps.isMultiple) {
    const selectedValues = searchableSelectProps.value ? [...searchableSelectProps.value] : uncontrolledMultipleValues;
    const updateSelectedValues = (nextValues: string[]) => {
      const resolvedValues = nextValues.map((selectedValue) => (selectedValue.startsWith("__create__") ? createOptionFromQuery() : selectedValue));
      const limitedValues = searchableSelectProps.maximumSelections ? resolvedValues.slice(0, searchableSelectProps.maximumSelections) : resolvedValues;
      if (!searchableSelectProps.value) setUncontrolledMultipleValues(limitedValues);
      searchableSelectProps.onValueChange?.(limitedValues);
      setSearchQuery("");
    };
    return (
      <Combobox multiple value={selectedValues} onChange={updateSelectedValues} disabled={isDisabled} onClose={() => setSearchQuery("")}>
        <div className={mergeClassNames("relative", className)}>
          <div className={CONTROL_CLASS_NAMES}>
            {selectedValues.map((selectedValue) => (
              <span key={selectedValue} className="flex items-center rounded-sm bg-surface-strong px-2 py-0.5">
                {findOption(selectedValue)?.label ?? selectedValue}
                <button type="button" aria-label={`Remove ${findOption(selectedValue)?.label ?? selectedValue}`} onClick={() => updateSelectedValues(selectedValues.filter((value) => value !== selectedValue))} className="ml-1.5 cursor-pointer text-foreground-muted hover:text-foreground-strong">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <ComboboxInput className="min-w-[80px] flex-1 border-0 bg-transparent p-0 py-1 text-sm focus:ring-0" placeholder={selectedValues.length ? "" : placeholder} onChange={(changeEvent) => setSearchQuery(changeEvent.target.value)} value={searchQuery} />
          </div>
          <ComboboxButton className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-2.5">
            <ChevronDown className="h-4 w-4 text-foreground-muted" />
          </ComboboxButton>
          {optionList}
          {name && selectedValues.map((selectedValue) => <input key={selectedValue} type="hidden" name={name} value={selectedValue} />)}
        </div>
      </Combobox>
    );
  }

  const selectedValue = searchableSelectProps.value !== undefined ? searchableSelectProps.value : uncontrolledSingleValue;
  const updateSelectedValue = (nextValue: string | null) => {
    const resolvedValue = nextValue?.startsWith("__create__") ? createOptionFromQuery() : nextValue;
    if (searchableSelectProps.value === undefined) setUncontrolledSingleValue(resolvedValue);
    searchableSelectProps.onValueChange?.(resolvedValue);
  };
  return (
    <Combobox value={selectedValue} onChange={updateSelectedValue} disabled={isDisabled} onClose={() => setSearchQuery("")}>
      <div className={mergeClassNames("relative", className)}>
        <div className={CONTROL_CLASS_NAMES}>
          <ComboboxInput
            className="flex-1 border-0 bg-transparent p-0 py-1 text-sm focus:ring-0"
            placeholder={placeholder}
            displayValue={(optionValue: string | null) => (optionValue ? (findOption(optionValue)?.label ?? optionValue) : "")}
            onChange={(changeEvent) => setSearchQuery(changeEvent.target.value)}
          />
        </div>
        <ComboboxButton className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-2.5">
          <ChevronDown className="h-4 w-4 text-foreground-muted" />
        </ComboboxButton>
        {optionList}
        {name && <input type="hidden" name={name} value={selectedValue ?? ""} />}
      </div>
    </Combobox>
  );
}
