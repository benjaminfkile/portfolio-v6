import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import MediaFrame from './MediaFrame';
import { mockReducedMotion } from '../../test/motion';

describe('MediaFrame', () => {
  const restores: Array<() => void> = [];
  afterEach(() => {
    while (restores.length) restores.pop()!();
  });

  it('renders a lazy, covering image with alt passthrough', () => {
    restores.push(mockReducedMotion(false));

    render(
      <MediaFrame
        src="https://media.example/pic.jpg"
        alt="A wiring diagram"
        aspectRatio="4 / 3"
      />,
    );
    const img = screen.getByRole('img', { name: 'A wiring diagram' });
    expect(img).toHaveAttribute('src', 'https://media.example/pic.jpg');
    expect(img).toHaveAttribute('loading', 'lazy');
    // aspect-ratio is applied to the frame (dynamic inline style).
    expect((img.parentElement as HTMLElement).style.aspectRatio).toBe('4 / 3');
  });

  it('allows an empty alt for a decorative image', () => {
    restores.push(mockReducedMotion(false));

    const { container } = render(
      <MediaFrame src="https://media.example/deco.png" alt="" />,
    );
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('alt', '');
  });

  it('autoplays muted/looping/inline video when motion is allowed', () => {
    restores.push(mockReducedMotion(false));

    const { container } = render(
      <MediaFrame type="video" src="https://media.example/clip.mp4" alt="Demo" />,
    );
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.autoplay).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video).toHaveAttribute('playsinline');
    // No opt-in control needed when it autoplays.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('ignores an OS reduced-motion preference — videos still autoplay (owner decision)', () => {
    restores.push(mockReducedMotion(true));

    const { container } = render(
      <MediaFrame
        type="video"
        src="https://media.example/clip.mp4"
        poster="https://media.example/poster.jpg"
        alt="Demo"
      />,
    );
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.autoplay).toBe(true);
    expect(
      screen.queryByRole('button', { name: /play video/i }),
    ).not.toBeInTheDocument();
  });

  it('fires onFirstPlay only on the first play of a video (§4.8)', () => {
    restores.push(mockReducedMotion(false));
    const onFirstPlay = vi.fn();

    const { container } = render(
      <MediaFrame
        type="video"
        src="https://media.example/clip.mp4"
        alt="Demo"
        onFirstPlay={onFirstPlay}
      />,
    );
    const video = container.querySelector('video') as HTMLVideoElement;

    fireEvent.play(video);
    fireEvent.play(video);

    expect(onFirstPlay).toHaveBeenCalledTimes(1);
  });
});
