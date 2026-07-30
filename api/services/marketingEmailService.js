/**
 * Marketing email service — Resend Broadcasts.
 *
 * Separate channel from the transactional email in services/emailService.js:
 * a dedicated FULL-ACCESS Resend client sends to the newsletter segment scoped
 * by topic (segment ∩ topic) via the Broadcasts API. Resend handles the queue,
 * throttling and per-topic unsubscribe.
 *
 * Safety model (see openspec change add-marketing-email-broadcasts):
 *  - Segment per environment: config.marketing.newsletterSegmentId points to a
 *    TEST segment outside production and the REAL one in production.
 *  - Circuit breaker: nothing is sent unless config.marketing.enabled AND an API
 *    key are present (local dev without a key is a no-op).
 *  - Send-once guard: the marketing_sends table prevents a second successful AUTO
 *    announcement for the same entity.
 *
 * Template placeholder conventions:
 *  - {{TOKEN}}  → replaced here, server-side, before sending (values escaped by
 *    the caller; *_BLOCK / IMAGE(S) / DESCRIPTION tokens carry pre-built HTML).
 *  - {{{VAR}}}  → left intact for Resend (e.g. {{{RESEND_UNSUBSCRIBE_URL}}}).
 */
const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');
const config = require('../config/env');
const logger = require('../config/logger');
const { db } = require('../config/database');
const { escapeForEmail, stripHtml } = require('../utils/htmlEscape');
const auctionService = require('./auctionService');
const drawService = require('./drawService');
const eventService = require('./eventService');

const esc = (v) => escapeForEmail(v == null ? '' : String(v));

// ---------------------------------------------------------------------------
// Resend client (created once, only when marketing is active)
// ---------------------------------------------------------------------------
let resendClient = null;
// The `noop` transport is an extra kill switch on top of the existing circuit
// breaker: under NODE_ENV=test (or EMAIL_TRANSPORT=noop) no broadcast, contact
// create/update or segment change may reach Resend, even if someone enables
// marketing in that environment. Every send path in this module goes through
// this check before getClient() is ever called.
const marketingActive = () => Boolean(
  config.emailTransport !== 'noop' && config.marketing.enabled && config.marketing.apiKey
);
const getClient = () => {
  if (!resendClient) resendClient = new Resend(config.marketing.apiKey);
  return resendClient;
};

const formatSender = () => {
  const from = config.marketing.from || config.emailFrom;
  return from.includes('<') ? from : `"140d Galería de Arte" <${from}>`;
};

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------
const TEMPLATE_DIR = path.join(__dirname, '..', 'assets', 'resend_templates');
const templateCache = new Map();

const loadTemplate = (name) => {
  if (!templateCache.has(name)) {
    templateCache.set(name, fs.readFileSync(path.join(TEMPLATE_DIR, `${name}.html`), 'utf8'));
  }
  return templateCache.get(name);
};

// Replace {{TOKEN}} but NEVER {{{TOKEN}}} (Resend triple-brace vars). The
// lookbehind/lookahead ensure a double-brace token that is part of a triple
// brace is left untouched. Unknown tokens collapse to '' so nothing leaks.
const renderTemplate = (name, tokens) =>
  loadTemplate(name).replace(
    /(?<!\{)\{\{\s*([A-Z0-9_]+)\s*\}\}(?!\})/g,
    (_, key) => (Object.prototype.hasOwnProperty.call(tokens, key) ? String(tokens[key] ?? '') : '')
  );

// ---------------------------------------------------------------------------
// URL + date helpers
// ---------------------------------------------------------------------------
const productImageUrl = (basename, productType) => {
  if (!basename) return null;
  if (config.cdnBaseUrl) {
    const prefix = productType === 'art' ? 'art' : 'others';
    return `${config.cdnBaseUrl}/${prefix}/${encodeURIComponent(basename)}`;
  }
  return productType === 'art'
    ? `${config.siteApiBaseUrl}/api/art/images/${encodeURIComponent(basename)}`
    : `${config.siteApiBaseUrl}/api/others/images/${encodeURIComponent(basename)}`;
};

const authorImageUrl = (profileImg) => {
  if (!profileImg) return null;
  if (/^https?:\/\//i.test(profileImg)) return profileImg;
  if (config.cdnBaseUrl) return `${config.cdnBaseUrl}/authors/${encodeURIComponent(profileImg)}`;
  return `${config.siteApiBaseUrl}/api/users/authors/images/${encodeURIComponent(profileImg)}`;
};

const absoluteUrl = (value) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const base = config.cdnBaseUrl || config.siteApiBaseUrl;
  return `${base}/${String(value).replace(/^\/+/, '')}`;
};

const fmtDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};

const fmtDateTime = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ---------------------------------------------------------------------------
// HTML block builders (already-escaped HTML injected as single tokens)
// ---------------------------------------------------------------------------
const heroImage = (url, alt) =>
  url
    ? `<img src="${url}" alt="${esc(alt)}" width="520" style="width:100%;max-width:520px;height:auto;display:block;border-radius:8px;border:1px solid #e5e7eb;">`
    : '';

const avatarImage = (url, alt) =>
  url
    ? `<img src="${url}" alt="${esc(alt)}" width="160" style="width:160px;height:160px;object-fit:cover;border-radius:9999px;border:1px solid #e5e7eb;display:block;margin:0 auto;">`
    : '';

// Up to 4 product previews: single hero, or a 2-column grid otherwise.
const previewImagesBlock = (previews) => {
  const items = (previews || [])
    .map((p) => ({ url: productImageUrl(p.basename, p.product_type), alt: p.name || '' }))
    .filter((it) => it.url)
    .slice(0, 4);
  if (items.length === 0) return '';
  if (items.length === 1) return heroImage(items[0].url, items[0].alt);
  let rows = '';
  for (let i = 0; i < items.length; i += 2) {
    const a = items[i];
    const b = items[i + 1];
    const cell = (it, pad) =>
      it
        ? `<img src="${it.url}" alt="${esc(it.alt)}" width="254" style="width:100%;max-width:254px;height:auto;display:block;border-radius:8px;border:1px solid #e5e7eb;">`
        : '';
    rows += `<tr>
      <td width="50%" style="padding:0 6px 12px 0;vertical-align:top;">${cell(a)}</td>
      <td width="50%" style="padding:0 0 12px 6px;vertical-align:top;">${cell(b)}</td>
    </tr>`;
  }
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table>`;
};

const baseTokens = (preheader) => ({
  PREHEADER: esc(preheader),
  LOGO_URL: config.logoUrl || 'https://cdn.140d.art/140d.png',
  YEAR: String(new Date().getFullYear()),
});

// ---------------------------------------------------------------------------
// Broadcast send + audit
// ---------------------------------------------------------------------------
async function sendBroadcast({ name, topicId, subject, html }) {
  if (!marketingActive()) {
    logger.info({ name, subject }, 'Marketing disabled (circuit breaker / missing key) — broadcast skipped');
    return { skipped: true };
  }
  const { data, error } = await getClient().broadcasts.create({
    name,
    segmentId: config.marketing.newsletterSegmentId,
    topicId: topicId || undefined,
    from: formatSender(),
    subject,
    html,
    send: true,
  });
  if (error) throw new Error(error.message || 'Resend broadcast failed');
  return { skipped: false, broadcastId: data.id };
}

async function recordSend({ kind, entityId, topicId, status, broadcastId, subject, error }) {
  try {
    await db.execute({
      sql: `INSERT INTO marketing_sends
              (kind, entity_id, topic_id, segment_id, resend_broadcast_id, status, subject, error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        kind,
        String(entityId),
        topicId || null,
        config.marketing.newsletterSegmentId || null,
        broadcastId || null,
        status,
        subject || null,
        error || null,
      ],
    });
  } catch (e) {
    logger.error({ err: e, kind, entityId }, 'Failed to record marketing_sends row');
  }
}

async function hasBeenSent(kind, entityId) {
  const r = await db.execute({
    sql: `SELECT 1 FROM marketing_sends WHERE kind = ? AND entity_id = ? AND status = 'sent' LIMIT 1`,
    args: [kind, String(entityId)],
  });
  return r.rows.length > 0;
}

// ---------------------------------------------------------------------------
// Builders — return { subject, html, topicId, name } or null if not eligible
// ---------------------------------------------------------------------------
async function buildAuction(auctionId) {
  const auction = await auctionService.getAuctionById(auctionId);
  if (!auction || !['scheduled', 'active'].includes(auction.status)) return null;
  const previews = auction.products || [];
  const single = previews.length === 1 ? previews[0] : null;
  const priceBlock = single && single.start_price != null
    ? `<p style="margin:6px 0 0;font-size:14px;color:#374151;"><strong style="color:#111827;">Precio de salida:</strong> €${Number(single.start_price).toFixed(2)}</p>`
    : '';
  const tokens = {
    ...baseTokens(`Nueva subasta en 140d: ${auction.name}`),
    TITLE: esc(auction.name),
    IMAGES: previewImagesBlock(previews),
    START_DATE: esc(fmtDate(auction.start_datetime)),
    END_DATE: esc(fmtDate(auction.end_datetime)),
    PRICE: priceBlock,
    CTA_URL: `${config.clientUrl}/eventos/subasta/${auction.id}`,
  };
  return {
    subject: `Nueva subasta: ${auction.name}`,
    html: renderTemplate('auction-announcement', tokens),
    topicId: config.marketing.topicAuctionsDraws,
    name: `Subasta ${auction.id} — ${auction.name}`,
  };
}

async function buildDraw(drawId) {
  const draw = await drawService.getDrawById(drawId);
  if (!draw || draw.status !== 'scheduled') return null;
  const imageUrl = productImageUrl(draw.basename, draw.product_type);
  const tokens = {
    ...baseTokens(`Nuevo sorteo en 140d: ${draw.name}`),
    TITLE: esc(draw.name),
    IMAGE: heroImage(imageUrl, draw.product_name || draw.name),
    PRICE: draw.price != null ? esc(`€${Number(draw.price).toFixed(2)}`) : '',
    START_DATE: esc(fmtDate(draw.start_datetime)),
    END_DATE: esc(fmtDate(draw.end_datetime)),
    CTA_URL: `${config.clientUrl}/eventos/sorteo/${draw.id}`,
  };
  return {
    subject: `Nuevo sorteo: ${draw.name}`,
    html: renderTemplate('draw-announcement', tokens),
    topicId: config.marketing.topicAuctionsDraws,
    name: `Sorteo ${draw.id} — ${draw.name}`,
  };
}

async function buildEvent(eventId) {
  const event = await eventService.getEventById(eventId);
  if (!event || event.status !== 'scheduled') return null;
  const imageUrl = absoluteUrl(event.cover_image_url);
  const description = event.description ? stripHtml(event.description) : '';
  const tokens = {
    ...baseTokens(`Nuevo evento en directo en 140d: ${event.title}`),
    TITLE: esc(event.title),
    CATEGORY: esc(event.category || ''),
    IMAGE: heroImage(imageUrl, event.title),
    DESCRIPTION: description
      ? `<p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">${esc(description)}</p>`
      : '',
    EVENT_DATETIME: esc(fmtDateTime(event.event_datetime)),
    CTA_URL: `${config.clientUrl}/live/${event.slug}`,
  };
  return {
    subject: `Nuevo evento en directo: ${event.title}`,
    html: renderTemplate('event-announcement', tokens),
    topicId: config.marketing.topicLiveEvents,
    name: `Evento ${event.id} — ${event.title}`,
  };
}

// ---------------------------------------------------------------------------
// AUTO announcements (non-blocking, never throw) — used by controller hooks
// ---------------------------------------------------------------------------
async function runAutoAnnounce(kind, entityId, builder) {
  try {
    if (!marketingActive()) {
      logger.info({ kind, entityId }, 'Marketing disabled — auto announce skipped');
      return;
    }
    if (await hasBeenSent(kind, entityId)) {
      logger.debug({ kind, entityId }, 'Entity already announced — skipping');
      return;
    }
    const built = await builder();
    if (!built) return; // not in a qualifying state
    const res = await sendBroadcast(built);
    if (res.skipped) return;
    await recordSend({ kind, entityId, topicId: built.topicId, status: 'sent', broadcastId: res.broadcastId, subject: built.subject });
    logger.info({ kind, entityId, broadcastId: res.broadcastId }, 'Marketing announcement sent');
  } catch (err) {
    logger.error({ err, kind, entityId }, 'Marketing announcement failed');
    await recordSend({ kind, entityId, status: 'failed', error: err.message });
  }
}

const announceAuctionIfEligible = (auctionId) => runAutoAnnounce('auction', auctionId, () => buildAuction(auctionId));
const announceDrawIfEligible = (drawId) => runAutoAnnounce('draw', drawId, () => buildDraw(drawId));
const announceEventIfEligible = (eventId) => runAutoAnnounce('event', eventId, () => buildEvent(eventId));

// ---------------------------------------------------------------------------
// MANUAL new-author announcement — used by the admin Marketing endpoint.
// Throws on failure so the admin gets feedback; records sent/failed either way.
// Not covered by the send-once guard (may be re-sent).
// ---------------------------------------------------------------------------
async function sendNewAuthorAnnouncement(author) {
  const name = author.full_name || 'Nuevo artista';
  const subject = `Nuevo artista en 140d: ${name}`;
  const tokens = {
    ...baseTokens(`${name} se une a 140d`),
    AUTHOR_NAME: esc(name),
    AUTHOR_IMAGE: avatarImage(authorImageUrl(author.profile_img), name),
    AUTHOR_LOCATION: author.location
      ? `<p style="margin:0;font-size:14px;color:#6b7280;">${esc(author.location)}</p>`
      : '',
    AUTHOR_BIO: author.bio
      ? `<p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">${esc(stripHtml(author.bio))}</p>`
      : '',
    CTA_URL: `${config.clientUrl}/`,
  };
  const html = renderTemplate('new-author', tokens);
  try {
    const res = await sendBroadcast({ name: `Nuevo autor ${author.id} — ${name}`, topicId: config.marketing.topicNewAuthors, subject, html });
    if (res.skipped) return res;
    await recordSend({ kind: 'new_author', entityId: author.id, topicId: config.marketing.topicNewAuthors, status: 'sent', broadcastId: res.broadcastId, subject });
    return res;
  } catch (err) {
    await recordSend({ kind: 'new_author', entityId: author.id, topicId: config.marketing.topicNewAuthors, status: 'failed', subject, error: err.message });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Audience contact management — used by the public newsletter signup.
// Same full-access client / circuit breaker as the broadcasts above. The
// newsletter segment is MANUAL, so new/updated contacts are explicitly added to
// it. Resend's contacts model has no audienceId (account-level audience).
// SDK surface (v6): contacts.create({ ..., segments, topics }),
// contacts.update({ ..., unsubscribed }) (no topics), contacts.topics.update,
// contacts.segments.add.
// ---------------------------------------------------------------------------

// The signup form sends stable topic KEYS, not Resend IDs — that keeps the IDs
// server-side and avoids leaking them into the client bundle. Map each key to
// the configured Resend topic ID.
const TOPIC_KEY_TO_CONFIG = {
  live_events: 'topicLiveEvents',
  auctions_draws: 'topicAuctionsDraws',
  new_authors: 'topicNewAuthors',
  newsletter: 'topicNewsletter',
};

// Known topics (key → Resend ID) that are actually configured.
const knownTopics = () =>
  Object.entries(TOPIC_KEY_TO_CONFIG)
    .map(([key, cfgKey]) => ({ key, id: config.marketing[cfgKey] }))
    .filter((t) => t.id);

// Translate a selection of topic KEYS into the FULL opt_in/opt_out state for
// every known topic (opt_in selected, opt_out the rest). Unknown keys ignored.
const buildTopicState = (selectedKeys) => {
  const selected = new Set(selectedKeys || []);
  return knownTopics().map((t) => ({ id: t.id, subscription: selected.has(t.key) ? 'opt_in' : 'opt_out' }));
};

async function getContactByEmail(email) {
  try {
    const { data, error } = await getClient().contacts.get({ email });
    if (error) return null; // not found / lookup failed
    return data || null;
  } catch {
    return null;
  }
}

// Best-effort: ensure an EXISTING contact belongs to the manual newsletter
// segment. A create() already assigns the segment inline, so this is only for
// the update path. Never throws — a missing membership must not fail the signup.
async function ensureSegmentMembership(email, contactId) {
  const segmentId = config.marketing.newsletterSegmentId;
  if (!segmentId) return;
  try {
    await getClient().contacts.segments.add(
      contactId ? { contactId, segmentId } : { email, segmentId }
    );
  } catch (err) {
    logger.warn({ err, email }, 'Could not ensure newsletter segment membership for existing contact');
  }
}

// Create the contact if new, or update + re-subscribe if it already exists
// (including a previously `unsubscribed` one). Idempotent: topic preferences are
// always rewritten from the current selection. Returns { skipped } when the
// circuit breaker is off so the caller can respond 503.
async function upsertSubscriber({ email, firstName, lastName, selectedTopicKeys }) {
  if (!marketingActive()) {
    logger.info({ email }, 'Marketing disabled (circuit breaker / missing key) — newsletter signup skipped');
    return { skipped: true };
  }
  const client = getClient();
  const topics = buildTopicState(selectedTopicKeys);
  // Resend's create expects segments as { id }[], not a bare string array.
  const segments = config.marketing.newsletterSegmentId ? [{ id: config.marketing.newsletterSegmentId }] : undefined;

  const existing = await getContactByEmail(email);

  if (!existing) {
    const { data, error } = await client.contacts.create({
      email,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      unsubscribed: false,
      segments,
      topics,
    });
    if (error) throw new Error(error.message || 'Resend contact create failed');
    return { skipped: false, created: true, contactId: data?.id };
  }

  // Existing contact: refresh name + re-subscribe (unsubscribed: false).
  const { error: updErr } = await client.contacts.update({
    email,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    unsubscribed: false,
  });
  if (updErr) throw new Error(updErr.message || 'Resend contact update failed');

  // Rewrite topic preferences (update() does not accept topics).
  const { error: topErr } = await client.contacts.topics.update({ email, topics });
  if (topErr) throw new Error(topErr.message || 'Resend contact topics update failed');

  await ensureSegmentMembership(email, existing.id);
  return { skipped: false, created: false, contactId: existing.id };
}

module.exports = {
  marketingActive,
  hasBeenSent,
  sendNewAuthorAnnouncement,
  announceAuctionIfEligible,
  announceDrawIfEligible,
  announceEventIfEligible,
  upsertSubscriber,
};
