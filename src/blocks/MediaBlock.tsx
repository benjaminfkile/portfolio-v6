import type { BlockProps, BlockOf } from './types';
import styles from './MediaBlock.module.css';

/**
 * A `media` block (spec §3.7): resolves `media_id` through the post's media map
 * (§6.8) to a CDN URL + `alt`, with an optional caption. An unresolved id (media
 * removed, older payload) renders nothing rather than a broken image.
 */
export default function MediaBlock({ block, media }: BlockProps) {
  const { media_id, caption } = block as BlockOf<'media'>;
  const asset = media[media_id];
  if (!asset) return null;

  return (
    <figure className={styles.block}>
      <img className={styles.media} src={asset.url} alt={asset.alt ?? ''} />
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}
