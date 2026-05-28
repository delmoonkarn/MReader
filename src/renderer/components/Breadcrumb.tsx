import { Link } from "react-router-dom";

export type Crumb = { id: number; name: string };

export default function Breadcrumb({ trail }: { trail: Crumb[] }) {
  // trail is root → leaf, with the last entry being the current folder (not a link).
  return (
    <nav className="flex items-center gap-1 text-sm min-w-0" aria-label="Breadcrumb">
      <Link to="/" className="text-indigo-400 hover:text-indigo-300 shrink-0">
        Main
      </Link>
      {trail.map((c, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={c.id} className="flex items-center gap-1 min-w-0">
            <span className="text-neutral-600 shrink-0">/</span>
            {isLast ? (
              <span className="text-neutral-200 truncate" title={c.name}>
                {c.name}
              </span>
            ) : (
              <Link
                to={`/folder/${c.id}`}
                className="text-indigo-400 hover:text-indigo-300 truncate"
                title={c.name}
              >
                {c.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
