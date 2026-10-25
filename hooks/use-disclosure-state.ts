"use client";

import { useCallback, useState } from "react";

export interface DisclosureState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setIsOpen: (isOpen: boolean) => void;
}

/**
 * Open/closed state for menus, modals, panels and other show-hide UI.
 *
 * @example
 * const searchPanel = useDisclosureState();
 * <button onClick={searchPanel.toggle}>Search</button>
 * {searchPanel.isOpen && <SearchPanel onClose={searchPanel.close} />}
 */
export function useDisclosureState(initialIsOpen = false): DisclosureState {
  const [isOpen, setIsOpen] = useState(initialIsOpen);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((previousIsOpen) => !previousIsOpen), []);
  return { isOpen, open, close, toggle, setIsOpen };
}
