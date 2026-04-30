/**
 * Share a URL via the Web Share API where available, falling back to the
 * clipboard. Single source of truth for share buttons on both the viewer
 * header and library cards.
 *
 * Outcome:
 *   - 'native'  — handed off to the OS share sheet. User dismissal is
 *                  indistinguishable from success; in either case we don't
 *                  surface our own feedback (the sheet is the feedback).
 *   - 'copied'  — Web Share unavailable or failed; clipboard write succeeded.
 *   - 'failed'  — both paths failed; caller should surface a manual fallback
 *                  (e.g. window.prompt with the URL).
 */

export type ShareOutcome = 'native' | 'copied' | 'failed';

export async function shareLink(url: string, title?: string): Promise<ShareOutcome> {
  // Native share sheet first — the win on mobile (and the only path that
  // routes into apps like Messages, Mail, Slack without leaving Stele).
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ url, title });
      return 'native';
    } catch (err) {
      // AbortError fires both when the user dismisses and (rarely) when the
      // platform aborts. Either way, no clipboard fallback — the user made
      // an intentional choice and we shouldn't second-guess.
      if ((err as Error)?.name === 'AbortError') return 'native';
      // Real failure (permission denied, transient platform error, etc.):
      // fall through to clipboard so the share still happens somehow.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
