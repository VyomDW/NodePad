import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardTemplate, DocKind } from "@hacktx/shared";
import { ArrowUp, Clock, LogOut, Moon, Plus, Sun, Trash2 } from "lucide-react";
import { api, signOut, useAuth } from "@/lib/auth";
import { newRoomId, roomUrl, TARGETS } from "@/lib/kinds";
import { DEV_DEFS, ICON, MEDIA_DEFS, routeTool, TOOL_DEFS } from "@/lib/nodeCloud";
import { Logo } from "./Logo";
import "./home.css";

interface FileInfo {
  id: string;
  kind: DocKind;
  template?: BoardTemplate;
  title: string;
  updatedAt: number;
  online: number;
  mine: boolean;
}

type Tool = { id: string; name: string; noun: string; color: string; ask: string };

const GROUPS: { name: string; tools: Tool[] }[] = [
  { name: "classic", tools: TOOL_DEFS },
  { name: "dev & design boards", tools: DEV_DEFS },
  { name: "3d & media", tools: MEDIA_DEFS },
];
const TOOLS: Record<string, Tool> = Object.fromEntries(GROUPS.flatMap((g) => g.tools).map((t) => [t.id, t]));
/** How many files show before "All N files" expands the list. */
const PREVIEW = 8;
const THEME_KEY = "nodepad-theme";

const toolOf = (f: FileInfo) => {
  const id = f.kind === "board" ? (f.template ?? "whiteboard") : f.kind;
  return TOOLS[id] ? id : "doc";
};

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};

function ToolIcon({ id, color, size = 26 }: { id: string; color: string; size?: number }) {
  return (
    <span className="ic" style={{ background: color, width: size, height: size }}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={ICON[id as keyof typeof ICON]} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Light or dark, from the saved choice or else the system setting. */
function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const toggle = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {}
      return next;
    });
  return [theme, toggle] as const;
}

/** Workspace home: tools down the side, your files in a list, and a prompt box to start something new. */
export function Home() {
  const account = useAuth((s) => s.account);
  const [theme, toggleTheme] = useTheme();
  const [files, setFiles] = useState<FileInfo[] | null>(null);
  const [tool, setTool] = useState<string | null>(null);
  const [sort, setSort] = useState<"edited" | "name">("edited");
  const [mineOnly, setMineOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [ask, setAsk] = useState("");
  const askRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "nodepad";
    let cancelled = false;
    api("/docs")
      .then((r) => (r.ok ? (r.json() as Promise<FileInfo[]>) : []))
      .catch(() => [] as FileInfo[])
      .then((fs) => !cancelled && setFiles(fs));
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    files?.forEach((f) => (c[toolOf(f)] = (c[toolOf(f)] ?? 0) + 1));
    return c;
  }, [files]);

  const list = useMemo(() => {
    const fs = (files ?? []).filter((f) => (!tool || toolOf(f) === tool) && (!mineOnly || f.mine));
    return fs.sort(sort === "name" ? (a, b) => a.title.localeCompare(b.title) : (a, b) => b.updatedAt - a.updatedAt);
  }, [files, tool, sort, mineOnly]);
  const shown = showAll ? list : list.slice(0, PREVIEW);

  const pick = (id: string | null) => {
    setTool(id);
    setShowAll(false);
  };

  const newFile = (id: string, prompt?: string) => {
    // music and video are made in the media studio, not as shared files
    if (id === "music" || id === "video") {
      const p = new URLSearchParams({ media: id });
      if (prompt) p.set("q", prompt);
      return location.assign(`${location.pathname}?${p}`);
    }
    const t = TARGETS.find((x) => x.key === id) ?? TARGETS[0];
    location.assign(roomUrl(newRoomId(), t.kind, prompt, t.template));
  };

  const remove = async (f: FileInfo) => {
    if (!confirm(f.mine === false ? `Remove "${f.title}" from your files? It stays shared with everyone else.` : `Delete "${f.title}"? This removes it for everyone.`)) return;
    const r = await api(`/docs/${encodeURIComponent(f.id)}`, { method: "DELETE" });
    if (r.ok) setFiles((fs) => fs?.filter((x) => x.id !== f.id) ?? null);
  };

  const q = ask.trim();
  const routed = q ? TOOLS[routeTool(q)] : null;
  const current = tool ? TOOLS[tool] : null;
  const total = tool ? (counts[tool] ?? 0) : (files?.length ?? 0);

  return (
    <div className="ink hm flex h-dvh flex-col overflow-hidden" data-theme={theme}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4 sm:px-6">
        <Logo />
        <span className="text-[17px] font-bold">nodepad</span>
        <span className="ml-2 hidden truncate text-sm text-dim md:inline">Docs, slides, boards, 3D scenes and media you make with AI</span>
        <div className="flex-1" />
        <button type="button" className="ghost" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}>
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        {account && (
          <>
            <span className="truncate text-sm text-dim max-sm:hidden">
              {account.name} <span className="opacity-70">@{account.username}</span>
            </span>
            <button type="button" className="ghost" onClick={() => void signOut()}>
              <LogOut className="size-3.5" />
              <span className="max-sm:hidden">Sign out</span>
            </button>
          </>
        )}
      </header>

      <div className="body">
        <nav className="side" aria-label="Tools">
          <button type="button" className="newbtn" onClick={() => (current ? newFile(current.id) : askRef.current?.focus())}>
            <Plus className="size-4" />
            {current ? `New ${current.name.toLowerCase()}` : "New file"}
          </button>
          <button type="button" className={`tool${tool ? "" : " on"}`} onClick={() => pick(null)} aria-pressed={!tool}>
            <span className="ic" style={{ background: "var(--ink)", color: "var(--page)", width: 26, height: 26 }}>
              <Clock className="size-[15px]" />
            </span>
            <span className="nm">All recent</span>
            <span className="ct">{files?.length ?? ""}</span>
          </button>
          {GROUPS.map((g) => (
            <div key={g.name} className="grp">
              <div className="hand">{g.name}</div>
              {g.tools.map((t) => (
                <button key={t.id} type="button" className={`tool${tool === t.id ? " on" : ""}`} style={{ "--c": t.color } as React.CSSProperties} onClick={() => pick(t.id)} aria-pressed={tool === t.id}>
                  <ToolIcon id={t.id} color={t.color} />
                  <span className="nm">{t.name}</span>
                  <span className="ct">{counts[t.id] ?? ""}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <main className="main">
          <div className="wrap">
            <form
              className="ask"
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                if (routed) newFile(routed.id, q);
              }}
            >
              <input ref={askRef} value={ask} onChange={(e) => setAsk(e.target.value)} aria-label="Describe what to make" placeholder={`Describe something new… “${(current ?? TOOLS.slides).ask}”`} />
              <button type="submit" className="go" aria-label="Start" disabled={!q}>
                <ArrowUp className="size-[17px]" />
              </button>
            </form>
            {routed && (
              <p className="route">
                Will open in <span className="rt" style={{ "--c": routed.color } as React.CSSProperties}><ToolIcon id={routed.id} color={routed.color} size={18} />{routed.name}</span> and start it for you
              </p>
            )}

            <div className="head">
              <h1>{current ? current.name : "All recent"}</h1>
              <span className="text-dim">{files ? `${total} file${total === 1 ? "" : "s"}` : ""}</span>
              <span className="flex-1" />
              <button type="button" className={`chip${sort === "edited" ? " on" : ""}`} onClick={() => setSort("edited")} aria-pressed={sort === "edited"}>Edited</button>
              <button type="button" className={`chip${sort === "name" ? " on" : ""}`} onClick={() => setSort("name")} aria-pressed={sort === "name"}>Name</button>
              <button type="button" className={`chip${mineOnly ? " on" : ""}`} onClick={() => setMineOnly((m) => !m)} aria-pressed={mineOnly}>Mine only</button>
            </div>

            <div className="table">
              <div className="row th" aria-hidden="true">
                <span />
                <span>Name</span>
                <span className="opt">Type</span>
                <span className="opt">Status</span>
                <span>Edited</span>
                <span />
              </div>
              {!files && <p className="empty">Loading your files…</p>}
              {files && list.length === 0 && (
                <div className="empty">
                  <p>{current ? `No ${current.noun}s yet.` : mineOnly ? "You haven't made any files yet." : "No files yet."}</p>
                  {current && (
                    <button type="button" className="chip on" onClick={() => newFile(current.id)}>
                      New {current.name.toLowerCase()}
                    </button>
                  )}
                </div>
              )}
              {shown.map((f) => {
                const t = TOOLS[toolOf(f)];
                return (
                  <div key={f.id} className="row" style={{ "--c": t.color } as React.CSSProperties}>
                    <ToolIcon id={t.id} color={t.color} size={30} />
                    <a className="nm" href={roomUrl(f.id)}>{f.title || "Untitled"}</a>
                    <span className="opt sub">{t.name}{f.mine === false ? " · shared" : ""}</span>
                    <span className="opt live">{f.online > 0 ? `● ${f.online} editing` : ""}</span>
                    <span className="sub">{ago(f.updatedAt)}</span>
                    <button type="button" className="del" onClick={() => void remove(f)} title={f.mine === false ? "Remove from my files" : "Delete file"} aria-label={`Delete ${f.title}`}>
                      <Trash2 className="size-[15px]" />
                    </button>
                  </div>
                );
              })}
            </div>
            {list.length > PREVIEW && (
              <button type="button" className="more" onClick={() => setShowAll((s) => !s)}>
                {showAll ? "Show fewer" : `All ${list.length} ${current ? `${current.name.toLowerCase()} ` : ""}files →`}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
