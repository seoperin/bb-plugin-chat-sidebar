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
        className="pointer-events-none absolute left-2.5 top-[7px] size-3.5 text-muted-foreground"
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
        className="h-7 rounded-full border-transparent bg-sidebar-accent/70 pl-7 pr-7 text-xs shadow-none [&::-webkit-search-cancel-button]:hidden"
      />
      {query !== "" ? (
        <button
          type="button"
          aria-label={t("search.clear")}
          onClick={() => onChange("")}
          className="absolute right-1.5 top-[5px] grid size-[18px] cursor-pointer place-items-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <Icon name="X" className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
