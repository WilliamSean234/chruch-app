"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Attendance, Participant } from "./MeetingAttendance";

export type DraftRow = Participant & { isNew?: boolean; removed?: boolean; changed?: boolean };
type NewRow = { key: string; personId: string | null; name: string; status: string };
export type DraftLink = { id: string; title: string; url: string; isNew?: boolean; removed?: boolean };
type ServerLink = { id: string; title: string; url: string };

const LINK_RE = /^https?:\/\/\S+$/i;

/** Sama dengan ringkasan di server: tamu tidak dihitung untuk kuorum. */
function summarize(rows: DraftRow[], quorumMin: number | null): Attendance {
  const members = rows.filter((r) => r.personId);
  const count = (st: string) => members.filter((r) => r.status === st).length;
  const present = count("PRESENT");
  return {
    invited: members.length, present, excused: count("EXCUSED"), absent: count("ABSENT"), pending: count("INVITED"),
    guests: rows.length - members.length, guestsPresent: rows.filter((r) => !r.personId && r.status === "PRESENT").length,
    percent: members.length ? Math.round((present * 100) / members.length) : 0, quorumMin,
    quorumMet: quorumMin == null ? null : members.length > 0 && present * 100 >= quorumMin * members.length,
  };
}

/**
 * Perubahan kehadiran, peserta, dan tautan ditampung di sini dan baru dikirim ke server saat "Simpan perubahan" ditekan.
 * Draf dikosongkan otomatis begitu data baru dari server tiba (setelah simpan atau muat ulang).
 */
export function useMeetingDraft(server: { participants: Participant[]; links: ServerLink[]; quorumMin: number | null }) {
  const [statusEdits, setStatusEdits] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<NewRow[]>([]);
  const [inviteAll, setInviteAll] = useState(false);
  const [linkAdds, setLinkAdds] = useState<{ key: string; title: string; url: string }[]>([]);
  const [linkRemoved, setLinkRemoved] = useState<Set<string>>(new Set());

  const reset = useCallback(() => {
    setStatusEdits({}); setRemoved(new Set()); setAdded([]); setInviteAll(false); setLinkAdds([]); setLinkRemoved(new Set());
  }, []);
  useEffect(() => { reset(); }, [server.participants, server.links, reset]);

  const rows = useMemo<DraftRow[]>(() => {
    const base: DraftRow[] = server.participants.map((p) => ({
      ...p, status: statusEdits[p.id] ?? p.status, changed: p.id in statusEdits, removed: removed.has(p.id),
    }));
    const extra: DraftRow[] = added.map((n) => ({ id: n.key, personId: n.personId, name: n.name, isGuest: !n.personId, status: n.status, note: null, positions: [], isNew: true }));
    return [...base, ...extra].sort((x, y) => Number(x.isGuest) - Number(y.isGuest) || x.name.localeCompare(y.name));
  }, [server.participants, statusEdits, removed, added]);

  const live = useMemo(() => rows.filter((r) => !r.removed), [rows]);
  const summary = useMemo(() => summarize(live, server.quorumMin), [live, server.quorumMin]);

  const links = useMemo<DraftLink[]>(() => [
    ...server.links.map((l) => ({ ...l, removed: linkRemoved.has(l.id) })),
    ...linkAdds.map((l) => ({ id: l.key, title: l.title, url: l.url, isNew: true })),
  ], [server.links, linkRemoved, linkAdds]);

  const mark = (row: DraftRow, next: string) => {
    const status = row.status === next ? "INVITED" : next;
    if (row.isNew) { setAdded((cur) => cur.map((n) => (n.key === row.id ? { ...n, status } : n))); return; }
    const original = server.participants.find((p) => p.id === row.id)?.status;
    setStatusEdits((cur) => {
      const n = { ...cur };
      if (status === original) delete n[row.id]; else n[row.id] = status;
      return n;
    });
  };
  const markAllPresent = () => {
    setStatusEdits((cur) => {
      const n = { ...cur };
      for (const p of server.participants) if (!removed.has(p.id) && (n[p.id] ?? p.status) === "INVITED") n[p.id] = "PRESENT";
      return n;
    });
    setAdded((cur) => cur.map((x) => (x.status === "INVITED" ? { ...x, status: "PRESENT" } : x)));
  };
  const removeRow = (row: DraftRow) => {
    if (row.isNew) { setAdded((cur) => cur.filter((n) => n.key !== row.id)); return; }
    setRemoved((cur) => new Set(cur).add(row.id));
  };
  const undoRemove = (row: DraftRow) => setRemoved((cur) => { const n = new Set(cur); n.delete(row.id); return n; });
  const addPeople = (members: { personId: string; name: string }[], guests: string[]) => {
    setAdded((cur) => {
      const have = new Set(cur.map((n) => n.key));
      const next = [...cur];
      for (const m of members) if (!have.has(`m:${m.personId}`)) next.push({ key: `m:${m.personId}`, personId: m.personId, name: m.name, status: "INVITED" });
      for (const g of guests) if (!have.has(`g:${g.toLowerCase()}`)) next.push({ key: `g:${g.toLowerCase()}`, personId: null, name: g, status: "INVITED" });
      return next;
    });
  };

  const addLink = (title: string, url: string): string | null => {
    if (!title.trim() || !url.trim()) return "Isi judul dan alamat tautan.";
    if (!LINK_RE.test(url.trim())) return "Alamat tautan harus diawali http:// atau https://";
    setLinkAdds((cur) => [...cur, { key: `n:${cur.length}:${Date.now()}`, title: title.trim(), url: url.trim() }]);
    return null;
  };
  const removeLink = (l: DraftLink) => {
    if (l.isNew) setLinkAdds((cur) => cur.filter((x) => x.key !== l.id));
    else setLinkRemoved((cur) => new Set(cur).add(l.id));
  };
  const undoRemoveLink = (l: DraftLink) => setLinkRemoved((cur) => { const n = new Set(cur); n.delete(l.id); return n; });

  const changeCount = Object.keys(statusEdits).filter((id) => !removed.has(id)).length + removed.size + added.length + (inviteAll ? 1 : 0) + linkAdds.length + linkRemoved.size;

  const payload = () => ({
    attendance: Object.entries(statusEdits).filter(([id]) => !removed.has(id)).map(([id, status]) => ({ id, status })),
    remove: [...removed],
    addMembers: added.filter((n) => n.personId).map((n) => ({ personId: n.personId as string, status: n.status })),
    addGuests: added.filter((n) => !n.personId).map((n) => ({ name: n.name, status: n.status })),
    addAllMembers: inviteAll,
    linkAdd: linkAdds.map((l) => ({ title: l.title, url: l.url })),
    linkRemove: [...linkRemoved],
  });

  return { rows, live, summary, links, mark, markAllPresent, removeRow, undoRemove, addPeople, inviteAll, setInviteAll, addLink, removeLink, undoRemoveLink, changeCount, payload, reset };
}
