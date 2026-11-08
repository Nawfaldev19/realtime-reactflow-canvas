import { Link } from "react-router-dom";
import { Workflow } from "lucide-react";

export function Brand({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="brand">
      <Workflow className="brand-mark" size={22} aria-hidden="true" />
      Live Canvas
    </Link>
  );
}
