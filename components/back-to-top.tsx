// "Back to top": sticks to the bottom corner of bb's scroll area once the
// list is scrolled down. Zero height, so it adds no space to the list.
import { Icon } from "@/components/ui/icon";
import { useT } from "./chat-context";

export function BackToTop({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <div className="pointer-events-none sticky bottom-0 z-10 h-0">
      <button
        type="button"
        aria-label={t("list.toTop")}
        title={t("list.toTop")}
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
        onClick={onClick}
        data-visible={visible ? "" : undefined}
        className="chat-to-top absolute bottom-3 right-3 grid size-8 cursor-pointer place-items-center rounded-full border border-sidebar-border bg-sidebar text-muted-foreground shadow-md outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon name="ArrowUp" className="size-4" />
      </button>
    </div>
  );
}
