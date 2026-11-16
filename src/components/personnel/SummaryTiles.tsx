import type { ComponentType, ReactNode } from "react";
import ui from "./personnel-ui.module.css";

/** Structural icon type (lucide-react does not export `LucideIcon`). */
export type IconComponent = ComponentType<{
  size?: number | string;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export type SummaryTone = "neutral" | "info" | "ok" | "warn" | "bad";

export interface SummaryTile {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconComponent;
  tone?: SummaryTone;
}

/**
 * Responsive summary tiles used at the top of Personnel list pages.
 * Tiles auto-fit their column (min 11.5rem) so 2–5 tiles stay balanced on
 * desktop and stack cleanly on mobile.
 */
export function SummaryTiles({
  tiles,
  className,
  ariaLabel,
}: {
  tiles: SummaryTile[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className={className ? `${ui.tiles} ${className}` : ui.tiles}
      aria-label={ariaLabel}
    >
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <div
            key={tile.label}
            className={ui.tile}
            data-tone={tile.tone ?? "neutral"}
          >
            {Icon ? (
              <span className={ui.tileIcon} aria-hidden="true">
                <Icon size={17} />
              </span>
            ) : null}
            <div className={ui.tileBody}>
              <p className={ui.tileLabel}>{tile.label}</p>
              <p className={ui.tileValue}>{tile.value}</p>
              {tile.hint ? <p className={ui.tileMeta}>{tile.hint}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
