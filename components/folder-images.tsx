// Experimental: folder pictures, like Discord's server icons. They come from
// the backend (shared by every device) and arrive live over realtime. Picking
// one opens a file, then a square crop: drag to move, scroll or the slider to
// zoom. Only the crop is saved, shrunk to FOLDER_IMAGE_SIZE.
//
// The last pictures seen are kept for the page and in localStorage, so a
// reload draws them at once instead of the icons first.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FOLDER_IMAGES_CHANNEL,
  FOLDER_IMAGE_SIZE,
  isFolderImage,
  sanitizeFolderImages,
  type FolderImageMap,
} from "@/lib/folder-images";
import type { rpcContract } from "@/lib/rpc";
import { readStored, writeStored } from "@/lib/storage";
import { useT } from "./chat-context";

interface FolderImagesValue {
  imageOf(folderId: string | null): string | null;
  /** Opens a file picker, then the crop. */
  pickImage(folderId: string, label: string): void;
  removeImage(folderId: string): void;
}

const FolderImagesContext = createContext<FolderImagesValue | null>(null);

const STORAGE_KEY = "chat-sidebar/folder-images";
const RETRIES = [1_000, 3_000, 10_000];

let remembered: FolderImageMap | null = null;

function recall(): FolderImageMap {
  remembered ??= readStored(STORAGE_KEY, (raw) => sanitizeFolderImages(JSON.parse(raw)), {});
  return remembered;
}

function remember(images: FolderImageMap): void {
  remembered = images;
  writeStored(STORAGE_KEY, JSON.stringify(images));
}

export function FolderImagesProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const [images, setImagesState] = useState<FolderImageMap>(recall);
  const setImages = useCallback((next: FolderImageMap) => {
    remember(next);
    setImagesState(next);
  }, []);

  // Pictures published while the connection was down are not replayed: load again when it is back.
  const connection = useRealtimeConnectionState();
  const wasConnected = useRef(connection === "connected");
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const connected = connection === "connected";
    if (connected && !wasConnected.current) setGeneration((value) => value + 1);
    wasConnected.current = connected;
  }, [connection]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = (index: number) => {
      rpcRef.current
        .call("images_get", null)
        .then((next) => alive && setImages(sanitizeFolderImages(next)))
        .catch(() => {
          const delay = RETRIES[index];
          if (alive && delay !== undefined) timer = setTimeout(() => attempt(index + 1), delay);
        });
    };
    attempt(0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [generation, setImages]);
  useRealtime(FOLDER_IMAGES_CHANNEL, (payload) => setImages(sanitizeFolderImages(payload)));

  const imagesRef = useRef(images);
  imagesRef.current = images;
  const save = useCallback(
    (folderId: string, image: string | null) => {
      const previous = imagesRef.current;
      const next = { ...previous };
      if (image === null) delete next[folderId];
      else next[folderId] = image;
      setImages(next);
      rpcRef.current
        .call("images_set", { folderId, image })
        .then((saved) => setImages(sanitizeFolderImages(saved)))
        .catch((cause: unknown) => {
          setImages(previous);
          toast.error(t("toast.imageFailed"), {
            description: cause instanceof Error ? cause.message : String(cause),
          });
        });
    },
    [setImages, t],
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<{ folderId: string; label: string } | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const value = useMemo<FolderImagesValue>(
    () => ({
      imageOf: (folderId) => (folderId === null ? null : (images[folderId] ?? null)),
      pickImage: (folderId, label) => {
        setTarget({ folderId, label });
        inputRef.current?.click();
      },
      removeImage: (folderId) => save(folderId, null),
    }),
    [images, save],
  );

  const close = () => {
    if (source !== null) URL.revokeObjectURL(source);
    setSource(null);
  };

  return (
    <FolderImagesContext.Provider value={value}>
      {children}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file !== undefined) setSource(URL.createObjectURL(file));
        }}
      />
      {target !== null && source !== null ? (
        <CropDialog
          source={source}
          label={target.label}
          onCancel={close}
          onSave={(image) => {
            save(target.folderId, image);
            close();
          }}
        />
      ) : null}
    </FolderImagesContext.Provider>
  );
}

export function useFolderImages(): FolderImagesValue {
  const value = useContext(FolderImagesContext);
  if (value === null) throw new Error("useFolderImages() must be used inside <FolderImagesProvider>");
  return value;
}

/** The crop square on screen, in CSS pixels. */
const VIEW = 240;
/** The rail's 40px square with its 13px corners, scaled up to VIEW. */
const RADIUS = (13 / 40) * VIEW;
const MAX_ZOOM = 6;

interface Crop {
  /** Screen pixels per image pixel. */
  scale: number;
  /** The image centre's offset from the square's centre, in screen pixels. */
  x: number;
  y: number;
}

function CropDialog({
  source,
  label,
  onCancel,
  onSave,
}: {
  source: string;
  label: string;
  onCancel: () => void;
  onSave: (image: string) => void;
}) {
  const t = useT();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; startX: number; startY: number; from: Crop } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      // An SVG without a size reports 0: give it the square's.
      const width = img.naturalWidth || VIEW;
      const height = img.naturalHeight || VIEW;
      img.width = width;
      img.height = height;
      setImage(img);
      setCrop({ scale: Math.max(VIEW / width, VIEW / height), x: 0, y: 0 });
    };
    img.onerror = () => {
      toast.error(t("image.unreadable"));
      onCancel();
    };
    img.src = source;
    // Opened once per file.
  }, [source]);

  // From "the whole picture fits" to MAX_ZOOM × "the square is covered".
  const fit = image === null ? 1 : Math.min(VIEW / image.width, VIEW / image.height);
  const cover = image === null ? 1 : Math.max(VIEW / image.width, VIEW / image.height);

  const clamp = useCallback(
    (next: Crop): Crop => {
      if (image === null) return next;
      const scale = Math.min(Math.max(next.scale, fit), cover * MAX_ZOOM);
      // A side larger than the square keeps it covered; a smaller one stays inside it.
      const limit = (side: number) => Math.abs(side * scale - VIEW) / 2;
      const x = Math.min(Math.max(next.x, -limit(image.width)), limit(image.width));
      const y = Math.min(Math.max(next.y, -limit(image.height)), limit(image.height));
      return { scale, x, y };
    },
    [image, fit, cover],
  );

  const zoomTo = (scale: number) => setCrop((current) => clamp({ ...current, scale }));

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, from: crop };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    setCrop(
      clamp({
        ...current.from,
        x: current.from.x + event.clientX - current.startX,
        y: current.from.y + event.clientY - current.startY,
      }),
    );
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // React's wheel listener is passive, so the page would scroll too.
  const viewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setCrop((current) => clamp({ ...current, scale: current.scale * Math.exp(-event.deltaY / 400) }));
    };
    view.addEventListener("wheel", onWheel, { passive: false });
    return () => view.removeEventListener("wheel", onWheel);
  }, [clamp]);

  const render = (): string | null => {
    if (image === null) return null;
    const canvas = document.createElement("canvas");
    canvas.width = FOLDER_IMAGE_SIZE;
    canvas.height = FOLDER_IMAGE_SIZE;
    const context = canvas.getContext("2d");
    if (context === null) return null;
    const ratio = FOLDER_IMAGE_SIZE / VIEW;
    const width = image.width * crop.scale;
    const height = image.height * crop.scale;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      (VIEW / 2 + crop.x - width / 2) * ratio,
      (VIEW / 2 + crop.y - height / 2) * ratio,
      width * ratio,
      height * ratio,
    );
    // Safari cannot encode WebP and quietly hands back a PNG.
    const webp = canvas.toDataURL("image/webp", 0.9);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
  };

  const placed =
    image === null
      ? undefined
      : {
          width: image.width * crop.scale,
          height: image.height * crop.scale,
          left: VIEW / 2 + crop.x - (image.width * crop.scale) / 2,
          top: VIEW / 2 + crop.y - (image.height * crop.scale) / 2,
        };
  // Logarithmic, so zooming in feels as even as zooming out.
  const sliderMin = Math.log(fit);
  const sliderMax = Math.log(cover * MAX_ZOOM);

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent className="max-w-[340px] gap-3 p-5 text-[13px]">
        <DialogHeader>
          <DialogTitle className="truncate text-base">{`${t("image.title")} · ${label}`}</DialogTitle>
          <DialogDescription className="text-xs">{t("image.hint")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-end justify-center gap-4">
          <div
            ref={viewRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="relative shrink-0 cursor-grab touch-none select-none overflow-hidden bg-sidebar-accent ring-1 ring-foreground/25 active:cursor-grabbing"
            style={{ width: VIEW, height: VIEW, borderRadius: RADIUS }}
          >
            {placed !== undefined ? (
              <img
                src={source}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={placed}
              />
            ) : null}
          </div>
        </div>
        <label className="flex items-center gap-3 text-xs text-muted-foreground">
          {t("image.zoom")}
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={(sliderMax - sliderMin) / 200 || 0.01}
            value={Math.log(crop.scale)}
            disabled={image === null}
            onChange={(event) => zoomTo(Math.exp(Number(event.currentTarget.value)))}
            className="flex-1 accent-foreground"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-md px-3 py-1.5 text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("folders.cancel")}
          </button>
          <button
            type="button"
            disabled={image === null}
            onClick={() => {
              const result = render();
              if (result !== null && isFolderImage(result)) onSave(result);
              else toast.error(t("toast.imageFailed"));
            }}
            className="cursor-pointer rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background outline-none hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {t("image.save")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
