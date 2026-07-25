import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { SectionProps } from './types';
import { getStatus } from '../lib/api';
import type { ServiceStatus, StatusResponse } from '../lib/api';
import styles from './StatusSection.module.css';

/**
 * The live `status` section (spec §3.5). Its *config* is published in the
 * snapshot — which services to show, whether to show response times — but its
 * *data* is fetched at runtime from `GET /api/status`.
 *
 * It renders a loading state and **degrades rather than errors** (§3.5): a
 * failed fetch renders as "unavailable", never a broken page. When the API
 * reports a genuine outage (`degraded: true`, itself the gateway's 503
 * translated into an honest shape) the section shows that degraded state
 * plainly — showing a real outage is more useful than hiding it.
 */
interface StatusData {
  /** Curate which services to display; empty/absent shows all returned. */
  services?: string[];
  show_response_times?: boolean;
}

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
    const controller = new AbortController();

    getStatus({ signal: controller.signal })
      .then((data) => setState({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'unavailable' });
        console.error('Failed to load service status', error);
      });

    return () => controller.abort();
  }, []);

  let body: ReactNode;

  if (state.status === 'loading') {
    body = <p>Loading…</p>;
  } else if (state.status === 'unavailable') {
    body = <p className={styles.muted}>Status is unavailable right now.</p>;
  } else {
    const services = selectServices(state.data.services ?? [], config.services);
    body = (
      <>
        {state.data.degraded && (
          <p role="status" className={styles.degraded}>
            Some services are degraded.
          </p>
        )}
        {services.length > 0 ? (
          <ul className={styles.list}>
            {services.map((service) => (
              <li key={service.name} className={styles.service}>
                <span
                  className={styles.dot}
                  data-ok={service.ok}
                  aria-hidden="true"
                />
                <span className={styles.name}>{service.name}</span>
                <span className={styles.state}>
                  {service.ok ? 'Operational' : 'Down'}
                </span>
                {config.show_response_times &&
                  service.response_time_ms != null && (
                    <span className={styles.time}>
                      {service.response_time_ms} ms
                    </span>
                  )}
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
    <section className={styles.status} aria-label="Service status">
      <h2 className={styles.title}>Status</h2>
      {body}
    </section>
  );
}
