import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { SectionProps } from './types';
import { getStatus } from '../lib/api';
import type { ServiceStatus, StatusResponse } from '../lib/api';
import SectionShell from '../components/ui/SectionShell';
import Panel from '../components/ui/Panel';
import Instrument from '../components/ui/Instrument';
import StatusDot from '../components/ui/StatusDot';
import styles from './StatusSection.module.css';

/**
 * The live `status` section (spec §3.5, DESIGN.md §5) — a Panel of `Instrument`s,
 * one per configured service, each with a `StatusDot` and (when configured) its
 * response time in mono `tabular-nums`. Its *config* is published in the snapshot
 * — which services to show, whether to show response times — but its *data* is
 * fetched at runtime from `GET /api/status` and re-polled on a ~30s interval to
 * match the endpoint's server-side cache.
 *
 * It renders a loading state and **degrades rather than errors** (§3.5): the
 * first failed fetch renders as "unavailable", and a later poll failure degrades
 * silently, keeping the last good reading rather than blanking the panel. When
 * the API reports a genuine outage (`degraded: true`, itself the gateway's 503
 * translated into an honest shape) the section shows that state plainly —
 * showing a real outage is more useful than hiding it.
 */
interface StatusData {
  /** Curate which services to display; empty/absent shows all returned. */
  services?: string[];
  show_response_times?: boolean;
  /** Optional header copy; defaults to a mono eyebrow + "Status" heading. */
  title?: string;
  eyebrow?: string;
  intro?: string;
}

/** Re-poll to match the endpoint's ~30s server-side cache (DESIGN.md §5). */
const POLL_INTERVAL_MS = 30_000;

type LoadState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; data: StatusResponse };

/**
 * Narrow the returned services to those named in config, preserving config
 * order (spec §3.5: config chooses *which services to show*). No `services`
 * config means show everything the endpoint returned.
 */
function selectServices(
  services: ServiceStatus[],
  wanted: string[] | undefined,
): ServiceStatus[] {
  if (!wanted || wanted.length === 0) return services;
  const byName = new Map(services.map((service) => [service.name, service]));
  return wanted
    .map((name) => byName.get(name))
    .filter((service): service is ServiceStatus => service != null);
}

export default function StatusSection({ section }: SectionProps) {
  const config = section.data as StatusData;
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      getStatus()
        .then((data) => {
          if (!cancelled) setState({ status: 'ready', data });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          // Silent degrade: only surface "unavailable" before the first good
          // reading; a later poll failure keeps the last data (DESIGN.md §5).
          setState((prev) =>
            prev.status === 'ready' ? prev : { status: 'unavailable' },
          );
          console.error('Failed to load service status', error);
        });
    };

    load(); // initial fetch on mount

    // Poll on the cache interval, but only while the tab is visible — a
    // backgrounded tab must not poll (matching now-playing, §3.5).
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  let body: ReactNode;

  if (state.status === 'loading') {
    body = <p className={styles.muted}>Loading…</p>;
  } else if (state.status === 'unavailable') {
    body = <p className={styles.muted}>Status is unavailable right now.</p>;
  } else {
    const services = selectServices(state.data.services ?? [], config.services);
    body = (
      <>
        {state.data.degraded && (
          <p role="status" className={styles.degraded}>
            <StatusDot variant="warn" />
            Some services are degraded.
          </p>
        )}
        {services.length > 0 ? (
          <ul className={styles.list}>
            {services.map((service) => (
              <li key={service.name}>
                <Instrument
                  className={styles.service}
                  leading={<StatusDot variant={service.ok ? 'ok' : 'err'} />}
                  label={service.name}
                  value={
                    <span className={styles.reading}>
                      <span
                        className={styles.state}
                        data-ok={service.ok}
                      >
                        {service.ok ? 'Operational' : 'Down'}
                      </span>
                      {config.show_response_times &&
                        service.response_time_ms != null && (
                          <span className={styles.time}>
                            {service.response_time_ms} ms
                          </span>
                        )}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          !state.data.degraded && (
            <p className={styles.muted}>All systems operational.</p>
          )
        )}
      </>
    );
  }

  return (
    <SectionShell
      title={config.title ?? 'Status'}
      eyebrow={config.eyebrow ?? '// service health'}
      intro={config.intro}
      className={styles.status}
    >
      <Panel className={styles.panel}>{body}</Panel>
    </SectionShell>
  );
}
