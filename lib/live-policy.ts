/** Browser refresh policy, independent of React and the transport. */
export class FormChanges<T> {
  private revisions = new Map<T, number>();
  private dirty = new Set<T>();
  private pending = new Set<T>();
  edit(form: T) {
    this.revisions.set(form, this.revision(form) + 1);
    this.dirty.add(form);
  }
  revision(form: T) { return this.revisions.get(form) ?? 0; }
  saved(form: T, submittedRevision: number) {
    if (this.revision(form) === submittedRevision) this.dirty.delete(form);
  }
  discard(form: T) { this.dirty.delete(form); }
  begin(form: T) { this.pending.add(form); }
  finish(form: T) { this.pending.delete(form); }
  hasPending() { return this.pending.size > 0; }
  hasChanges() { return this.dirty.size > 0 || this.hasPending(); }
  prune(connected: (form: T) => boolean) {
    for (const form of this.revisions.keys()) {
      if (!connected(form)) { this.revisions.delete(form); this.dirty.delete(form); this.pending.delete(form); }
    }
    for (const form of this.pending) if (!connected(form)) this.pending.delete(form);
  }
}

/** Estimate transport delay with a monotonic request/response midpoint. */
export function synchronizedTime(serverNow: number, sent: number, received: number) {
  return { serverNow: serverNow + Math.max(0, received - sent) / 2, reference: received };
}
