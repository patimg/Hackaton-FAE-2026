export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="empty"><h2>{title}</h2><p className="muted">{children}</p></section>;
}
