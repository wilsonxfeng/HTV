/** Conservative safety shortcut; all progression still passes application guards. */
export function parseSpokenControl(
  message: string,
): "stop" | "pause" | "resume" | null {
  const text = message.trim().toLowerCase().replaceAll("’", "'");
  const discomfort =
    /\b(pain|painful|dizzy|dizziness|hurts|uncomfortable|discomfort)\b/.test(
      text,
    );
  const negated =
    /\b(no|without|not feeling)\s+(any\s+)?(pain|dizziness|discomfort)\b|\bnot (dizzy|uncomfortable)\b/.test(
      text,
    );
  if (discomfort && !negated) return "stop";
  if (
    /\b(stop|quit|cancel)\b|\bend (the |this )?(session|exercise|practice)\b/.test(
      text,
    ) &&
    !/\b(don't|do not|no need to) stop\b/.test(text)
  )
    return "stop";
  if (/\bpause\b/.test(text) && !/\b(don't|do not) pause\b/.test(text))
    return "pause";
  if (
    /^(i'm ready|im ready|ready|resume|let's continue|continue)[.!]?$/.test(
      text,
    )
  )
    return "resume";
  return null;
}
