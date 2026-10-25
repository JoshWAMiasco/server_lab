import Image from "next/image";
import type { ReactNode } from "react";
import { mergeClassNames } from "@/utilities/merge-class-names";

export type AvatarSize = "extra-small" | "small" | "medium" | "large" | "extra-large";
export type AvatarShape = "circle" | "rounded";

const avatarSizeClassNames: Record<AvatarSize, string> = {
  "extra-small": "h-6 w-6",
  small: "h-9 w-9",
  medium: "h-11 w-11",
  large: "h-14 w-14",
  "extra-large": "h-24 w-24",
};

const avatarImageSizes: Record<AvatarSize, string> = {
  "extra-small": "24px",
  small: "36px",
  medium: "44px",
  large: "56px",
  "extra-large": "96px",
};

export interface AvatarProps {
  photoUrl: string;
  name: string;
  size?: AvatarSize;
  shape?: AvatarShape;
  hasBorder?: boolean;
  isZoomable?: boolean;
  statusIndicator?: ReactNode;
  className?: string;
}

/**
 * A user photo cropped to a circle or rounded square, with an optional status dot or badge.
 *
 * @example
 * <Avatar photoUrl="/images/users/user2-100x100.jpg" name="Margaret Ellison" size="medium" hasBorder />
 * <Avatar photoUrl={buildUserPhotoPath(user.photoNumber)} name={user.fullName} statusIndicator={<OnlineDot />} />
 */
export function Avatar({ photoUrl, name, size = "small", shape = "circle", hasBorder = false, isZoomable = false, statusIndicator, className }: AvatarProps) {
  return (
    <div className={mergeClassNames("relative shrink-0", avatarSizeClassNames[size], className)}>
      <div
        className={mergeClassNames(
          "image-fit h-full w-full overflow-hidden",
          shape === "circle" ? "rounded-full" : "rounded-lg",
          hasBorder && "border-[3px] border-line/70",
          isZoomable && "zoom-in box",
        )}
      >
        <Image src={photoUrl} alt={name} fill sizes={avatarImageSizes[size]} />
      </div>
      {statusIndicator}
    </div>
  );
}

export interface AvatarGroupProps {
  people: readonly { photoUrl: string; name: string }[];
  size?: AvatarSize;
  maximumVisible?: number;
  className?: string;
}

/**
 * Overlapping avatars, with a "+N" counter when there are more people than `maximumVisible`.
 *
 * @example
 * <AvatarGroup people={teamMembers.map((user) => ({ photoUrl: buildUserPhotoPath(user.photoNumber), name: user.fullName }))} maximumVisible={4} />
 */
export function AvatarGroup({ people, size = "extra-small", maximumVisible = 5, className }: AvatarGroupProps) {
  const visiblePeople = people.slice(0, maximumVisible);
  const hiddenCount = people.length - visiblePeople.length;
  return (
    <div className={mergeClassNames("flex items-center", className)}>
      {visiblePeople.map((person, personIndex) => (
        <Avatar
          key={`${person.name}-${personIndex}`}
          photoUrl={person.photoUrl}
          name={person.name}
          size={size}
          isZoomable
          className={mergeClassNames(personIndex > 0 && "-ml-1.5", "rounded-full border-2 border-surface")}
        />
      ))}
      {hiddenCount > 0 && <div className="ml-1.5 text-xs text-foreground-muted">+{hiddenCount}</div>}
    </div>
  );
}
