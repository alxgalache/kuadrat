/**
 * Pure helpers over the objects Agora Cloud Recording leaves in a task's
 * folder (change: agora-event-recording). The bucket is the source of truth of
 * what a recording contains — an interrupted task never returned a fileList
 * from `stop`, and its files exist all the same.
 *
 * File naming (Agora "Manage recorded files"):
 *   composite:  <sid>_<cname>.m3u8 · <sid>_<cname>_<utc>.ts · <sid>_<cname>_<n>.mp4
 *   individual: <sid>_<cname>__uid_s_<uid>__uid_e_<type>.m3u8 / .mpd
 *               and one .ts / .webm slice per ~segment with the same stem
 */

const UID_PATTERN = /__uid_s_(\d+)__uid_e_([a-z]+)/;

function basename(key) {
  return String(key).split('/').pop();
}

/** The deliverable of a composite recording: its MP4 files, in order. */
function mp4Files(objects) {
  return objects
    .filter((obj) => /\.mp4$/i.test(obj.key))
    .map((obj) => ({ name: basename(obj.key), bytes: obj.size || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}

/**
 * Group an individual recording's objects by the uid in their name. Objects
 * without a uid in the name (none are expected) are ignored here and still
 * count in the task totals.
 * @returns {Array<{ uid: number, tracks: string[], objectCount: number, bytes: number }>}
 */
function groupObjectsByUid(objects) {
  const byUid = new Map();
  for (const obj of objects) {
    const match = UID_PATTERN.exec(basename(obj.key));
    if (!match) continue;
    const uid = Number(match[1]);
    const type = match[2];
    if (!byUid.has(uid)) byUid.set(uid, { uid, tracks: new Set(), objectCount: 0, bytes: 0 });
    const group = byUid.get(uid);
    if (type === 'audio' || type === 'video') group.tracks.add(type);
    group.objectCount += 1;
    group.bytes += obj.size || 0;
  }
  return [...byUid.values()]
    .map((group) => ({ ...group, tracks: [...group.tracks].sort() }))
    .sort((a, b) => a.uid - b.uid);
}

function totals(objects) {
  return {
    objectCount: objects.length,
    totalBytes: objects.reduce((sum, obj) => sum + (obj.size || 0), 0),
  };
}

module.exports = { UID_PATTERN, basename, mp4Files, groupObjectsByUid, totals };
