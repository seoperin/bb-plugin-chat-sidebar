// Search over the chat list. Enter opens the first match, ArrowDown moves
// into the list, Escape clears (and only then lets the key through to bb).
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { useT } from "./chat-context";

export function SearchBar({
  query,
  onChange,
  onSubmit,
  onArrowDown,
}: {
  query: string;
  onChange: (query: string) => void;
  onSubmit: () => void;
  onArrowDown: () => void;
}) {
  const t = useT();
  return (
    <div className="relative min-w-0 flex-1">
      <Icon
        name="Search"
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground max-md:pointer-coarse:left-3 max-md:pointer-coarse:size-4"
      />
      <Input
        type="search"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (query !== "") event.stopPropagation();
            onChange("");
          }
          if (event.key === "Enter") onSubmit();
          if (event.key === "ArrowDown") {
            event.preventDefault();
            onArrowDown();
          }
        }}
        placeholder={t("search.placeholder")}
        aria-label={t("search.label")}
        className="h-7 rounded-full border-transparent bg-sidebar-accent/70 pl-7 pr-7 text-xs max-md:pointer-coarse:pl-9 max-md:pointer-coarse:pr-10 shadow-none [&::-webkit-search-cancel-button]:hidden"
      />
      {query !== "" ? (
        <button
          type="button"
          aria-label={t("search.clear")}
          onClick={() => onChange("")}
          className="chat-tab-hit chat-tab-hit-square absolute right-1.5 top-1/2 grid size-[18px] -translate-y-1/2 cursor-pointer place-items-center rounded-full text-muted-foreground hover:text-foreground max-md:pointer-coarse:right-1 max-md:pointer-coarse:size-8"
        >
          <Icon name="X" className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
