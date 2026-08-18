import { useEffect, useState } from 'react';
import type { SectionProps } from './types';
import type { ResumeSectionData } from '../types/content';
import { getResume, resumeDownloadUrl } from '../lib/api';
import type { ResumeResponse } from '../lib/api';
import SectionShell from '../components/ui/SectionShell';
import Panel from '../components/ui/Panel';
import LinkButton from '../components/ui/LinkButton';
import styles from './ResumeSection.module.css';

/**
 * The live `resume` section (spec §3.5, DESIGN.md §5). Its *config* is
 * snapshotted (optional header copy only); its *data* — the newest uploaded
 * PDF — is fetched at runtime from `GET /api/resume`, so a fresh upload appears
 * without a content republish.
 *
 * Standard live-section rules apply (§3.5):
 *  - `{ available: false }` and any failed fetch both degrade to a calm
 *    "no resume available" state; the section still renders its header so the
 *    page's outline stays intact but never surfaces a broken embed.
 *  - The inline PDF viewer is an `<object>` pointing at the inline URL — its
 *    fallback children render (an "open in new tab" prompt) when the browser
 *    can't render a PDF inline.
 *  - On small screens where inline PDF rendering is unreliable, CSS swaps the
 *    embed for a prominent "open in new tab" card instead of a cramped viewer.
 *  - The Download button targets `/api/resume/download` (absolute API origin,
 *    same rule as the beacon) so the browser saves the file with an attachment
 *    disposition rather than navigating to the inline URL. A companion
 *    "open in new tab" link opens the inline URL for readers who prefer viewing
 *    to downloading.
 *  - Every control is a ≥44px touch target (DESIGN.md §3, §7) and the embed
 *    carries a title for assistive tech.
 */

type LoadState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; data: Extract<ResumeResponse, { available: true }> };

export default function ResumeSection({ section }: SectionProps) {
  const config = section.data as ResumeSectionData;
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    getResume()
      .then((data) => {
        if (cancelled) return;
        setState(
          data.available
            ? { status: 'ready', data }
            : { status: 'unavailable' },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: 'unavailable' });
        console.error('Failed to load resume', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SectionShell
      title={config.heading}
      eyebrow={config.eyebrow}
      intro={config.intro}
      className={styles.resume}
    >
      {state.status === 'loading' && (
        <Panel className={styles.panel}>
          <p className={styles.muted}>Loading…</p>
        </Panel>
      )}

      {state.status === 'unavailable' && (
        <Panel className={styles.panel}>
          <p className={styles.muted}>No resume available right now.</p>
        </Panel>
      )}

      {state.status === 'ready' && (
        <ResumeReady inlineUrl={state.data.url} filename={state.data.filename} />
      )}
    </SectionShell>
  );
}

interface ResumeReadyProps {
  inlineUrl: string;
  filename: string;
}

function ResumeReady({ inlineUrl, filename }: ResumeReadyProps) {
  return (
    <div className={styles.body}>
      {/*
        Inline viewer for desktops/tablets — CSS hides this on small screens
        (where inline PDF rendering is unreliable). <object>'s fallback children
        render when the browser cannot display a PDF inline (§3.5 degrade).
      */}
      <div className={styles.embedWrapper}>
        <object
          className={styles.embed}
          data={inlineUrl}
          type="application/pdf"
          aria-label={`Resume — ${filename}`}
          title="Resume PDF viewer"
        >
          <div className={styles.embedFallback}>
            <p className={styles.muted}>
              Your browser can’t display this PDF inline.
            </p>
            <LinkButton
              variant="button"
              href={inlineUrl}
              external
              className={styles.action}
            >
              Open in new tab
            </LinkButton>
          </div>
        </object>
      </div>

      {/*
        Small-screen card — the inline viewer is unreliable at narrow widths so
        we render a prominent open-in-new-tab affordance instead of a cramped
        embed. CSS hides this on wider viewports (DESIGN.md §5).
      */}
      <Panel className={styles.smallCard}>
        <p className={styles.smallCardBody}>
          The resume opens best in your browser’s PDF viewer.
        </p>
        <LinkButton
          variant="button"
          href={inlineUrl}
          external
          className={styles.action}
        >
          Open resume
        </LinkButton>
      </Panel>

      <div className={styles.actions}>
        <LinkButton
          variant="button"
          href={resumeDownloadUrl}
          className={styles.action}
          download={filename}
        >
          Download PDF
        </LinkButton>
        <LinkButton
          variant="button"
          href={inlineUrl}
          external
          className={styles.action}
        >
          Open in new tab
        </LinkButton>
      </div>
    </div>
  );
}
