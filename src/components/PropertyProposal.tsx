/** Shared section rhythm for short, share-only property proposals. */
export function PropertySectionHeading({ number, title, text, id }: { number: string; title: string; text?: string; id?: string }) {
  return <header className="franchise-section-heading"><span>{number}</span><div><h2 id={id}>{title}</h2>{text ? <p>{text}</p> : null}</div></header>;
}
