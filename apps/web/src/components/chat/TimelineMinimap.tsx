import {
  resolveTimelineMinimapPreview,
  resolveTimelineMinimapTickIndices,
  type TimelineMinimapItem,
} from "./timelineMinimapItems";
import { useRef, useState, type MouseEvent } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Button } from "../ui/button";
import {
  resolveTimelineMinimapHeightStyle,
  resolveTimelineMinimapIndexFromPointer,
  resolveTimelineMinimapNavigationInteractive,
  resolveTimelineMinimapTopPercent,
  TIMELINE_MINIMAP_ITEM_SPACING,
  TIMELINE_MINIMAP_MIN_ITEMS,
} from "./MessagesTimeline.logic";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { observeResize } from "~/lib/observeResize";

const PREVIEW_INTENT_DELAY_MS = 120;

// A release outside the window can skip `mouseup`, so the next button-free
// `mousemove` also counts.
function onMouseButtonsReleased(onRelease: () => void): () => void {
  const check = (event: globalThis.MouseEvent) => {
    if (event.buttons !== 0) return;
    stop();
    onRelease();
  };
  const stop = () => {
    window.removeEventListener("mouseup", check);
    window.removeEventListener("mousemove", check);
  };
  window.addEventListener("mouseup", check);
  window.addEventListener("mousemove", check);
  return stop;
}

export function TimelineMinimap({
  hasPersistentGutter,
  hitStripWidth,
  currentIndex,
  items,
  stripMap,
  onWheel,
  onSelect,
}: {
  hasPersistentGutter: boolean;
  hitStripWidth: number;
  currentIndex: number | null;
  items: ReadonlyArray<TimelineMinimapItem>;
  stripMap: Map<string, HTMLSpanElement>;
  onWheel: (event: WheelEvent) => void;
  onSelect: (item: TimelineMinimapItem) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [previewShown, setPreviewShown] = useState(false);
  const [railHeight, setRailHeight] = useState(0);
  const previewTimerRef = useRef<number | undefined>(undefined);
  const railButtonRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLSpanElement>(null);
  const wheelTargetRef = (node: HTMLDivElement | null) => {
    if (!node) return;
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  };
  const railRef = (node: HTMLDivElement | null) => {
    if (!node) return;
    return observeResize(node, ([entry]) => setRailHeight(entry?.contentRect.height ?? 0));
  };

  const pressedOnStripRef = useRef(false);
  const [passThrough, setPassThrough] = useState(false);

  // Long threads get fewer ticks than turns so each tick keeps a usable target.
  const tickIndices = resolveTimelineMinimapTickIndices(
    items.length,
    railHeight > 0 ? railHeight / TIMELINE_MINIMAP_ITEM_SPACING + 1 : items.length,
  );
  const tickCount = tickIndices.length;
  const thinned = tickCount < items.length;
  const inViewBandHeight = `max(2px, calc(100% / ${items.length - 1}))`;
  const nearestTick = (itemIndex: number) =>
    tickCount <= 1 ? 0 : Math.round((itemIndex * (tickCount - 1)) / (items.length - 1));

  const resolvedActiveIndex =
    activeIndex !== null && activeIndex < items.length ? activeIndex : null;
  const activeTick = resolvedActiveIndex === null ? null : nearestTick(resolvedActiveIndex);
  const activeItem =
    previewShown && resolvedActiveIndex !== null
      ? resolveTimelineMinimapPreview(items[resolvedActiveIndex] ?? null)
      : null;
  const navigationInteractive =
    resolveTimelineMinimapNavigationInteractive(hitStripWidth) && !passThrough;
  const activeTopPercent =
    activeTick === null ? 0 : resolveTimelineMinimapTopPercent(activeTick, tickCount);
  const activeTooltipTranslate =
    activeTick === 0 ? "0%" : activeTick === tickCount - 1 ? "-100%" : "-50%";
  const resolvedCurrentIndex =
    currentIndex !== null && currentIndex >= 0 && currentIndex < items.length ? currentIndex : null;
  const previousItem =
    resolvedCurrentIndex === null ? null : (items[resolvedCurrentIndex - 1] ?? null);
  const nextItem = resolvedCurrentIndex === null ? null : (items[resolvedCurrentIndex + 1] ?? null);

  const resolveItemIndexFromPointer = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const tick = resolveTimelineMinimapIndexFromPointer({
      itemCount: tickCount,
      railTop: rect.top,
      railHeight: rect.height,
      pointerY: event.clientY,
    });
    return tick === null ? null : (tickIndices[tick] ?? null);
  };

  const hideHover = () => {
    window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = undefined;
    setActiveIndex(null);
    setPreviewShown(false);
  };
  // The preview sits beside the rail, so moving between the two keeps it open.
  const hideHoverUnlessEntering = (event: MouseEvent<HTMLElement>) => {
    const to = event.relatedTarget;
    if (
      to instanceof Node &&
      (railButtonRef.current?.contains(to) || previewRef.current?.contains(to))
    ) {
      return;
    }
    hideHover();
  };

  const moveActiveIndex = (delta: number) => {
    setActiveIndex((current) => {
      const base = current ?? 0;
      return Math.max(0, Math.min(items.length - 1, base + delta));
    });
  };

  if (items.length < TIMELINE_MINIMAP_MIN_ITEMS) {
    return null;
  }

  return (
    <div
      className={cn(
        "group/minimap pointer-events-none absolute inset-y-0 left-0 z-40 hidden w-18 [@media(pointer:fine)]:block",
        hasPersistentGutter
          ? "opacity-100"
          : "opacity-0 transition-opacity duration-150 hover:opacity-100 focus-within:opacity-100",
      )}
      data-testid="timeline-minimap"
      data-persistent-gutter={hasPersistentGutter ? "true" : "false"}
      ref={wheelTargetRef}
    >
      <div className="relative h-full w-full select-none">
        <div
          className={cn(
            "absolute top-1/2 left-3 -translate-y-1/2",
            hitStripWidth > 0 && !passThrough ? "pointer-events-auto" : "pointer-events-none",
          )}
          onMouseDown={() => {
            if (pressedOnStripRef.current) return;
            pressedOnStripRef.current = true;
            onMouseButtonsReleased(() => {
              pressedOnStripRef.current = false;
            });
          }}
          onMouseMove={(event) => {
            if (event.buttons === 0 || pressedOnStripRef.current || passThrough) return;
            setPassThrough(true);
            onMouseButtonsReleased(() => setPassThrough(false));
          }}
          ref={railRef}
          style={{
            height: resolveTimelineMinimapHeightStyle(items.length),
            width: hitStripWidth,
          }}
        >
          <TimelineMinimapNavigationButton
            direction="previous"
            disabled={previousItem === null}
            interactive={navigationInteractive}
            onClick={() => {
              if (previousItem) onSelect(previousItem);
            }}
          />
          <button
            aria-label={`Jump to message: ${activeItem?.userText ?? "User message"}`}
            className="absolute inset-y-0 left-0 w-full cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
            onBlur={hideHover}
            onClick={(event) => {
              const nextIndex = resolveItemIndexFromPointer(event);
              const selectedItem = nextIndex === null ? null : (items[nextIndex] ?? null);
              if (selectedItem) {
                onSelect(selectedItem);
              }
              event.currentTarget.blur();
            }}
            onFocus={() => {
              setActiveIndex((current) => current ?? resolvedCurrentIndex ?? 0);
              setPreviewShown(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveActiveIndex(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveActiveIndex(-1);
              } else if (event.key === "Home") {
                event.preventDefault();
                setActiveIndex(0);
              } else if (event.key === "End") {
                event.preventDefault();
                setActiveIndex(items.length - 1);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (activeItem) {
                  onSelect(activeItem);
                }
              }
            }}
            onMouseLeave={hideHoverUnlessEntering}
            onMouseMove={(event) => {
              if (event.buttons !== 0 && !pressedOnStripRef.current) return;
              setActiveIndex(resolveItemIndexFromPointer(event));
              if (previewShown || previewTimerRef.current !== undefined) return;
              previewTimerRef.current = window.setTimeout(() => {
                previewTimerRef.current = undefined;
                setPreviewShown(true);
              }, PREVIEW_INTENT_DELAY_MS);
            }}
            onMouseDown={(event) => event.preventDefault()}
            ref={railButtonRef}
            type="button"
          >
            <div className="absolute top-0 left-3 h-full w-px bg-border/15" />
            {tickIndices.map((itemIndex, tick) => {
              const distance = activeTick === null ? null : Math.abs(tick - activeTick);
              return (
                // Compositor-friendly on purpose: the hover fisheye flips a band
                // of ticks on every pointer move, so ticks animate only transform.
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute left-0 h-0.5 w-6 origin-left -translate-y-1/2 rounded-full transition-transform duration-150",
                    distance === 0 ? "bg-foreground/85" : "bg-muted-foreground/30",
                    distance === 0
                      ? "scale-x-100"
                      : distance === 1
                        ? "scale-x-[0.667]"
                        : distance === 2
                          ? "scale-x-[0.5]"
                          : "scale-x-[0.333]",
                  )}
                  key={items[itemIndex]?.id ?? itemIndex}
                  style={{ top: `${resolveTimelineMinimapTopPercent(tick, tickCount)}%` }}
                />
              );
            })}
            {items.map((item, index) => (
              // One in-view mark per turn; on a thinned rail the marks grow to
              // touch, so the visible turns read as one scroll-position band.
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute left-0 h-0.5 w-3 -translate-y-1/2 bg-foreground/70 opacity-0 transition-opacity duration-150 data-[in-view=true]:opacity-100",
                  !thinned && "rounded-full",
                )}
                data-in-view="false"
                data-minimap-strip
                key={item.id}
                ref={(node) => {
                  if (node) {
                    stripMap.set(item.id, node);
                  } else {
                    stripMap.delete(item.id);
                  }
                }}
                style={{
                  top: `${resolveTimelineMinimapTopPercent(index, items.length)}%`,
                  height: thinned ? inViewBandHeight : undefined,
                }}
              />
            ))}
          </button>
          {activeItem ? (
            <span
              className="pointer-events-auto absolute left-8 z-20 w-80 cursor-text select-text"
              data-minimap-preview
              onMouseLeave={hideHoverUnlessEntering}
              onMouseMove={(event) => event.stopPropagation()}
              ref={previewRef}
              style={{
                top: `${activeTopPercent}%`,
                transform: `translateY(${activeTooltipTranslate})`,
              }}
            >
              <span className="dropdown-glass block rounded-xl p-3 text-left text-popover-foreground shadow-xl shadow-black/25">
                <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium leading-5">
                  {activeItem.userText ?? "User message"}
                </span>
                {activeItem.assistantText ? (
                  <span
                    className="mt-1 max-h-[3.75rem] overflow-hidden text-muted-foreground text-sm leading-5"
                    style={{
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 3,
                    }}
                  >
                    {activeItem.assistantText}
                  </span>
                ) : null}
              </span>
            </span>
          ) : null}
          <TimelineMinimapNavigationButton
            direction="next"
            disabled={nextItem === null}
            interactive={navigationInteractive}
            onClick={() => {
              if (nextItem) onSelect(nextItem);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function TimelineMinimapNavigationButton({
  direction,
  disabled,
  interactive,
  onClick,
}: {
  direction: "previous" | "next";
  disabled: boolean;
  interactive: boolean;
  onClick: () => void;
}) {
  const previous = direction === "previous";
  const label = previous ? "Previous turn" : "Next turn";
  const Icon = previous ? ChevronUpIcon : ChevronDownIcon;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "absolute left-1 z-10 inline-flex -translate-x-1/2 opacity-0 transition-opacity duration-150 hover:opacity-100 focus-within:opacity-100",
              interactive ? "pointer-events-auto" : "pointer-events-none",
              previous ? "bottom-[calc(100%+2px)]" : "top-[calc(100%+2px)]",
            )}
          />
        }
      >
        <Button
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          size="icon-micro"
          type="button"
          variant="ghost-muted"
        >
          <Icon className="size-4 text-foreground/90" />
        </Button>
      </TooltipTrigger>
      <TooltipPopup side={previous ? "top" : "bottom"}>{label}</TooltipPopup>
    </Tooltip>
  );
}
