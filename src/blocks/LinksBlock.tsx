import type { BlockProps, BlockOf } from './types';
import LinkList from '../components/LinkList';

/**
 * A `links` block (spec §3.7): reuses the shared {@link LinkList} renderer — the
 * same one portfolio items use (§3.4) — so a post's link list groups, orders,
 * and opens off-site links identically. Restricting protocols to `http`/`https`
 * is enforced at the admin write boundary (§3.4).
 */
export default function LinksBlock({ block }: BlockProps) {
  const { links } = block as BlockOf<'links'>;

  return <LinkList links={links} />;
}
