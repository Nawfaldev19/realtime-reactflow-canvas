import { Link } from "react-router-dom";
import { PublicLayout } from "../components/PublicLayout";

export function NotFoundPage() {
  return (
    <PublicLayout>
      <div className="state card">
        <h1>Page not found</h1>
        <p>That address doesn&apos;t match anything here.</p>
        <Link to="/" className="button button-secondary">
          Go to the start page
        </Link>
      </div>
    </PublicLayout>
  );
}
