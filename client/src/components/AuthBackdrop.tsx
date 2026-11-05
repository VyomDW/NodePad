import { useEffect, useRef } from "react";
import { mountPromptFiles } from "@/lib/promptFiles";

/**
 * Behind the sign-in sheet: real nodepad prompts float in pale pencil and take turns becoming their files.
 * Hovering or tapping one turns it straight away. The graph paper is the CSS desk underneath.
 */
export function AuthBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => mountPromptFiles(canvas.current!), []);
  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />;
}
