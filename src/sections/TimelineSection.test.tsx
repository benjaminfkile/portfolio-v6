import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import TimelineSection from './TimelineSection';
import type { MediaMap, Section, SectionItem } from '../types/content';

function timelineSection(
  items: SectionItem[],
  data: Record<string, unknown> = {},
): Section {
  return { id: 'sec-timeline', type: 'timeline', data, items } as Section;
}

describe('TimelineSection (DESIGN.md §5)', () => {
  it('renders each entry with its date range, title, and description in order', () => {
    render(
      <TimelineSection
        section={timelineSection(
          [
            {
              id: 'e1',
              data: {
                date_range: '2021 – 2023',
                title: 'Senior Engineer',
                description: 'Built the platform.',
              },
            },
            {
              id: 'e2',
              data: {
                date_range: '2019 – 2021',
                title: 'Engineer',
                description: 'Shipped features.',
              },
            },
          ],
          { heading: 'Experience' },
        )}
        media={{}}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Experience' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Senior Engineer' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2021 – 2023')).toBeInTheDocument();
    expect(screen.getByText('Built the platform.')).toBeInTheDocument();
    // Order is meaningful, so entries render as an ordered list.
    expect(screen.getByRole('list').tagName).toBe('OL');
  });

  it('renders no image even when an entry still carries a media_id that resolves in the media map', () => {
    const media: MediaMap = {
      m1: { url: 'https://media.benkile.com/a.jpg', alt: 'A screenshot' },
    };
    const { container } = render(
      <TimelineSection
        section={timelineSection([
          {
            id: 'e1',
            data: {
              date_range: '2021',
              title: 'Legacy entry with media_id',
              description: 'x',
              media_id: 'm1',
            },
          },
          {
            id: 'e2',
            data: { date_range: '2020', title: 'No media', description: 'y' },
          },
        ])}
        media={media}
      />,
    );

    // Timeline entries no longer render images — a stale media_id in an older
    // published document is ignored, not rendered.
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(
      screen.getByRole('heading', { level: 3, name: 'Legacy entry with media_id' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'No media' }),
    ).toBeInTheDocument();
  });

  it('emits no heading when the data has none (§7 headerless)', () => {
    render(<TimelineSection section={timelineSection([])} media={{}} />);

    expect(screen.queryByRole('heading')).toBeNull();
  });
});
