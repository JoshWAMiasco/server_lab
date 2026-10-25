"use client";

import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import Image from "next/image";
import Link from "next/link";
import { Search, SearchX } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { mergeClassNames } from "@/utilities/merge-class-names";

export interface GlobalSearchResultItem {
  title: string;
  subtitle: string;
  href: string;
  photoUrl?: string;
}

export interface GlobalSearchResultGroup {
  groupTitle: string;
  seeAllHref: string;
  items: readonly GlobalSearchResultItem[];
}

export interface GlobalSearchShortcut {
  label: string;
  href: string;
  icon: ReactNode;
}

export interface GlobalSearchProps {
  resultGroups: readonly GlobalSearchResultGroup[];
  shortcuts: readonly GlobalSearchShortcut[];
  trigger: ReactNode;
  maximumItemsPerGroup?: number;
}

/**
 * The quick-search dialog (⌘K / Ctrl+K). Filters the given result groups as the user types; with
 * fewer than 2 characters it shows the shortcuts and the first items of each group.
 *
 * @example
 * <GlobalSearch
 *   trigger={<QuickSearchButton />}
 *   shortcuts={[{ label: "Users", href: "/users", icon: <Users2 className="h-4 w-4 stroke-[1.3]" /> }]}
 *   resultGroups={[{ groupTitle: "Users", seeAllHref: "/users", items: userSearchItems }]}
 * />
 */
export function GlobalSearch({ resultGroups, shortcuts, trigger, maximumItemsPerGroup = 3 }: GlobalSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if ((keyboardEvent.metaKey || keyboardEvent.ctrlKey) && keyboardEvent.key.toLowerCase() === "k") {
        keyboardEvent.preventDefault();
        setIsOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length >= 2;
  const visibleGroups = resultGroups
    .map((resultGroup) => ({
      ...resultGroup,
      items: (isSearching
        ? resultGroup.items.filter((resultItem) =>
            `${resultItem.title} ${resultItem.subtitle}`.toLowerCase().includes(normalizedQuery),
          )
        : resultGroup.items
      ).slice(0, maximumItemsPerGroup),
    }))
    .filter((resultGroup) => resultGroup.items.length > 0);
  const closeSearch = () => {
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <>
      <span className="contents" onClick={() => setIsOpen(true)}>
        {trigger}
      </span>
      <Dialog open={isOpen} onClose={closeSearch} className="relative z-[60]">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-canvas/80 backdrop-blur-[2px] transition-opacity duration-100 data-closed:opacity-0"
        />
        <div className="fixed inset-0 overflow-y-auto">
          <DialogPanel
            transition
            className="relative mx-auto my-2 w-[95%] transition-transform data-closed:scale-95 sm:mt-40 sm:w-[600px] lg:w-[700px]"
          >
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex w-12 items-center justify-center">
                <Search className="-mr-1.5 h-5 w-5 stroke-[1] text-foreground-muted" />
              </div>
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(changeEvent) => setSearchQuery(changeEvent.target.value)}
                placeholder="Quick search..."
                className="w-full rounded-lg border-0 border-line py-3.5 pr-14 pl-12 text-base shadow-lg transition duration-200 ease-in-out placeholder:text-foreground-subtle/90 focus:ring-0"
              />
              <div className="absolute inset-y-0 right-0 flex w-14 items-center">
                <div className="mr-auto rounded-box border bg-surface-muted px-2 py-1 text-xs text-foreground-muted/80">
                  ESC
                </div>
              </div>
            </div>
            <div className="relative z-10 mt-1 max-h-[468px] overflow-y-auto rounded-lg bg-surface pb-1 shadow-lg sm:max-h-[615px]">
              {isSearching && visibleGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center pt-20 pb-28">
                  <SearchX className="h-20 w-20 fill-brand/5 stroke-[0.5] text-brand/20" />
                  <div className="mt-5 text-xl font-medium font-display">No result found</div>
                  <div className="mt-3 w-2/3 text-center leading-relaxed text-foreground-muted">
                    No results found for <span className="font-medium italic">&quot;{searchQuery}&quot;</span>. Please
                    try a different search term or check your spelling.
                  </div>
                </div>
              ) : (
                <>
                  {!isSearching && (
                    <div className="px-5 py-4">
                      <div className="text-xs text-foreground-muted uppercase">Start your search here...</div>
                      <div className="mt-3.5 flex flex-wrap gap-2">
                        {shortcuts.map((shortcut) => (
                          <Link
                            key={shortcut.label}
                            href={shortcut.href}
                            onClick={closeSearch}
                            className="flex items-center gap-x-1.5 rounded-full border border-line-strong/70 px-3 py-0.5 hover:bg-surface-subtle"
                          >
                            {shortcut.icon}
                            {shortcut.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {visibleGroups.map((resultGroup, groupIndex) => (
                    <div
                      key={resultGroup.groupTitle}
                      className={mergeClassNames(
                        "px-5 py-4",
                        (groupIndex > 0 || !isSearching) && "border-t border-dashed",
                      )}
                    >
                      <div className="flex items-center">
                        <div className="text-xs text-foreground-muted uppercase">{resultGroup.groupTitle}</div>
                        <Link
                          href={resultGroup.seeAllHref}
                          onClick={closeSearch}
                          className="ml-auto text-xs text-foreground-muted"
                        >
                          See All
                        </Link>
                      </div>
                      <div className="mt-3.5 flex flex-col gap-1">
                        {resultGroup.items.map((resultItem) => (
                          <Link
                            key={`${resultItem.href}-${resultItem.title}`}
                            href={resultItem.href}
                            onClick={closeSearch}
                            className="flex items-center gap-2.5 rounded-md border border-transparent p-1 hover:border-line hover:bg-surface-subtle/80"
                          >
                            {resultItem.photoUrl ? (
                              <div className="image-fit zoom-in box h-6 w-6 overflow-hidden rounded-full border-2 border-line/70">
                                <Image src={resultItem.photoUrl} alt={resultItem.title} fill sizes="24px" />
                              </div>
                            ) : (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-primary/10 bg-primary/10 text-xs font-medium text-primary">
                                {resultItem.title.charAt(0)}
                              </div>
                            )}
                            <div className="truncate font-medium">{resultItem.title}</div>
                            <div className="hidden text-foreground-muted sm:block">{resultItem.subtitle}</div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
