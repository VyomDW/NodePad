import { useEffect, useRef, type CSSProperties } from "react";
import { Moon, Sun } from "lucide-react";
import { DEV_DEFS, iconSvg, MEDIA_DEFS, TOOL_DEFS } from "@/lib/nodeCloud";
import { mountLanding } from "@/lib/landingScene";
import { useTheme } from "@/lib/theme";
import { Logo } from "./Logo";
import "./landing.css";

const GROUPS = [
  { name: "Office", tools: TOOL_DEFS },
  { name: "Dev & design boards", tools: DEV_DEFS },
  { name: "Studio & media", tools: MEDIA_DEFS },
];

const Icon = ({ id }: { id: string }) => <span className="ic" dangerouslySetInnerHTML={{ __html: iconSvg(id) }} />;
const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Up = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Declared at module level: a component created inside Landing would be a new type on every render, so React
// would swap in fresh buttons that lack the click listeners mountLanding attached (e.g. once a saved sign-in loads).
const GoNode = ({ small }: { small?: boolean }) => (
  <button type="button" data-go className={small ? "go-node sm ink-btn" : "go-node ink-btn"}>
    <span className="dot" />
    go to node
    {!small && <Arrow />}
  </button>
);

/** First screen: the logo's one-stroke n in 3D, wired to every tool. "go to node" flies into it and opens the home screen. */
export function Landing({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const enter = useRef(onEnter);
  enter.current = onEnter;
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    document.title = "nodepad";
    return mountLanding(root.current!, { onEnter: () => enter.current() });
  }, []);

  return (
    <div ref={root} className="lp" data-theme={theme}>
      <div className="progress" aria-hidden />
      <div className="hero" id="top">
        <nav className="top" aria-label="Main">
          <div className="in">
            <a className="brand" href="#top">
              <Logo />
              nodepad
            </a>
            <div className="links">
              <a href="#tools">Tools</a>
              <a href="#how">How it works</a>
            </div>
            <button
              type="button"
              className="theme"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </button>
            <GoNode small />
          </div>
        </nav>
        <div className="ov">
          <div className="ann">
            <svg viewBox="0 0 64 54" aria-hidden>
              <path d="M8 50C14 30 30 14 56 8M44 4l12 4-6 11" />
            </svg>
            <span>start here</span>
          </div>
        </div>
        <div className="copy">
          <div className="in">
            <div className="box">
              <span className="kicker">one pad, every kind of file</span>
              <h1>
                Every idea starts as{" "}
                <span className="stroke">
                  one stroke.
                  <svg viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden>
                    <path d="M4 14C60 6 150 4 296 10" />
                  </svg>
                </span>
              </h1>
              <p className="lede">
                Say what you need and nodepad starts the right file: a doc, a deck, a sheet, a board, a 3D scene or a track. Every file hangs off one graph you can fly through with your team.
              </p>
              <div className="ctas">
                <GoNode />
                <a className="ghost" href="#tools">
                  See all 13 tools
                </a>
              </div>
              <div className="meta">
                <span>13 tools</span>
                <span>live co-editing</span>
                <span>voice input</span>
              </div>
            </div>
          </div>
        </div>
        <a className="scrollcue" href="#tools">
          scroll
          <svg viewBox="0 0 18 22" aria-hidden>
            <path d="M9 2v17M3 13l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      <main>
        <section className="band" id="tools">
          <div className="in">
            <div className="head">
              <div>
                <span className="eyebrow">The cloud</span>
                <h2>Thirteen tools hanging off one node</h2>
                <p className="sub">Each tool is a node on the graph. Open one to see its recent files around it, or type a request and nodepad picks the node for you.</p>
              </div>
              <p className="hand">
                these are real prompts people
                <br />
                start with. try one on the home screen
              </p>
            </div>
            <div className="sheets">
              {GROUPS.map((g) => (
                <div className="sheet" key={g.name}>
                  <h3>
                    {g.name}
                    <small>{g.tools.length} nodes</small>
                  </h3>
                  <ul className="tools">
                    {g.tools.map((t) => (
                      <li key={t.id} style={{ "--c": t.color } as CSSProperties}>
                        <Icon id={t.id} />
                        <b>{t.name}</b>
                        <q>{t.ask}</q>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="band tight" id="how">
          <div className="in">
            <div className="head">
              <div>
                <span className="eyebrow">How it works</span>
                <h2>From a sentence to a shared file</h2>
              </div>
              <p className="sub">Three steps, and the last one keeps going: your team and nodepad edit the same file at the same time.</p>
            </div>
            <div className="steps">
              <div className="step">
                <span className="n">1</span>
                <h3>Say what you need</h3>
                <p>Type it or hold the mic. Plain words are enough.</p>
                <div className="frag">
                  <div className="ask">
                    <span>Build a monthly student budget with a pie chart</span>
                    <i>
                      <Up />
                    </i>
                  </div>
                </div>
              </div>
              <div className="step">
                <span className="n">2</span>
                <h3>nodepad picks the node</h3>
                <p>It routes the request to the tool that fits and starts the file.</p>
                <div className="frag">
                  <div className="route">
                    Will use{" "}
                    <span className="rt" style={{ "--c": "#059669" } as CSSProperties}>
                      <i dangerouslySetInnerHTML={{ __html: iconSvg("sheet") }} />
                      Spreadsheet
                    </span>{" "}
                    and start it for you
                  </div>
                  <div className="mini">
                    {[40, 72, 55, 90, 30].map((h, i) => (
                      <s key={i} style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="step">
                <span className="n">3</span>
                <h3>Edit it together, live</h3>
                <p>Teammates join the same file, and nodepad keeps editing when you ask.</p>
                <div className="frag">
                  <div className="live">
                    <span className="presence">
                      <span className="av a">A</span>
                      <span className="av v">V</span>
                      <span className="av s">S</span>
                    </span>
                    <b>3 editing</b>
                    <span className="muse">node</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="band tight">
          <div className="in">
            <div className="cta">
              <div>
                <span className="hand">ready when you are</span>
                <h2>Your files are already on the graph</h2>
                <p className="sub">Jump in and fly to the tool you need, or start something new from the prompt box.</p>
              </div>
              <GoNode />
              <svg className="mark" viewBox="0 0 32 32" aria-hidden>
                <path d="M10 23V15a6 6 0 0 1 12 0v8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                <circle cx="10" cy="23" r="2.8" fill="currentColor" />
                <circle cx="22" cy="23" r="2.8" fill="currentColor" />
              </svg>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <div className="in">
          <span>nodepad · built at HackTX 2026</span>
          <span>Docs, slides, boards, 3D scenes and media you make with AI</span>
        </div>
      </footer>
    </div>
  );
}
