import type { ComponentType } from 'react';
import type { Block, MediaMap } from '../types/content';
import type { BlockProps } from './types';
import { BLOCK_REGISTRY } from '../registry';

/**
 * The registry indexed by an arbitrary string: `block.type` is a `BlockType` at
 * the type level, but a published post body can carry a block type this build
 * doesn't know yet — so the lookup must be allowed to miss (spec §3.7).
 */
const REGISTRY = BLOCK_REGISTRY as Record<
  string,
  ComponentType<BlockProps> | undefined
>;

/**
 * Renders a post body — an ordered `Block[]` — by mapping each block through
 * `BLOCK_REGISTRY` (spec §3.7), exactly as `ContentPage` maps sections one level up.
 * An unknown block type renders nothing and logs a warning, so a post authored
 * against a newer block type degrades rather than crashing.
 */
export default function BlockRenderer({
  body,
  media,
}: {
  body: Block[];
  media: MediaMap;
}) {
  return (
    <>
      {body.map((block, index) => {
        const Component = REGISTRY[block.type];
        if (!Component) {
          console.warn(
            `Unknown block type "${(block as { type: string }).type}" — rendering nothing (spec §3.7).`,
          );
          return null;
        }
        return <Component key={index} block={block} media={media} />;
      })}
    </>
  );
}
