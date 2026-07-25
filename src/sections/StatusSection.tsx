import type { SectionProps } from './types';

/**
 * Placeholder for the live `status` section (spec §3.5). Its config is in the
 * snapshot but its data is fetched at runtime from `GET /api/status`. Registered
 * now so the type resolves; the runtime fetch, loading, and degraded states land
 * in the next task. Renders nothing for the moment.
 */
export default function StatusSection(_props: SectionProps) {
  return null;
}
