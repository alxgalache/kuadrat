/**
 * The event announcement and the 48 h reminder show the same cover image, so
 * its public URL has one owner (change: event-reminder-email).
 */

const config = require('../config/env');
const { eventCoverImageUrl } = require('../utils/eventCoverImage');

describe('eventCoverImageUrl', () => {
  const original = { cdnBaseUrl: config.cdnBaseUrl, siteApiBaseUrl: config.siteApiBaseUrl };

  afterEach(() => {
    config.cdnBaseUrl = original.cdnBaseUrl;
    config.siteApiBaseUrl = original.siteApiBaseUrl;
  });

  it('takes an absolute URL as written', () => {
    config.cdnBaseUrl = 'https://cdn.example.test';
    expect(eventCoverImageUrl({ cover_image_url: 'https://img.example.test/a.jpg' }))
      .toBe('https://img.example.test/a.jpg');
  });

  it('hangs a relative path from the CDN when there is one', () => {
    config.cdnBaseUrl = 'https://cdn.example.test';
    expect(eventCoverImageUrl({ cover_image_url: '/events/cover.jpg' }))
      .toBe('https://cdn.example.test/events/cover.jpg');
  });

  it('hangs a relative path from the API without a CDN', () => {
    config.cdnBaseUrl = '';
    config.siteApiBaseUrl = 'https://api.example.test';
    expect(eventCoverImageUrl({ cover_image_url: 'events/cover.jpg' }))
      .toBe('https://api.example.test/events/cover.jpg');
  });

  it('prefers the list image when the event has both', () => {
    expect(eventCoverImageUrl({
      cover_image_url: 'https://img.example.test/list.jpg',
      detail_image_url: 'https://img.example.test/detail.jpg',
    })).toBe('https://img.example.test/list.jpg');
  });

  it('falls back to the detail image when there is no list image', () => {
    config.cdnBaseUrl = 'https://cdn.example.test';
    expect(eventCoverImageUrl({ cover_image_url: '', detail_image_url: '/events/detail.jpg' }))
      .toBe('https://cdn.example.test/events/detail.jpg');
    expect(eventCoverImageUrl({ cover_image_url: null, detail_image_url: 'https://img.example.test/d.jpg' }))
      .toBe('https://img.example.test/d.jpg');
  });

  it('returns null when the event has no cover', () => {
    expect(eventCoverImageUrl({ cover_image_url: null })).toBeNull();
    expect(eventCoverImageUrl({ cover_image_url: null, detail_image_url: null })).toBeNull();
    expect(eventCoverImageUrl({})).toBeNull();
    expect(eventCoverImageUrl(null)).toBeNull();
  });
});
