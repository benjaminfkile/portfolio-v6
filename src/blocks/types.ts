import type { Block, MediaMap } from '../types/content';

/**
 * The props every block component receives. `BlockRenderer` maps a post body's
 * blocks through `BLOCK_REGISTRY` (spec §3.7), passing each block plus the post's
 * media map so a `media` block can resolve its `media_id` to a CDN URL (§6.8).
 *
 * `block` is the whole discriminated union; each component narrows it to its own
 * variant with {@link BlockOf}, mirroring how section components narrow `data`.
 */
export interface BlockProps {
  block: Block;
  media: MediaMap;
}

/** The `Block` variant for a given `type` — e.g. `BlockOf<'code'>`. */
export type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
