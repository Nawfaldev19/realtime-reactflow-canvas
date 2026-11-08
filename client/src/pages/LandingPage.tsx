import { Link } from "react-router-dom";
import { CloudUpload, FileDown, History, LayoutDashboard, Lock } from "lucide-react";
import { GuidedTour } from "../components/GuidedTour";
import { PublicLayout } from "../components/PublicLayout";

const ALSO = [
  {
    Icon: CloudUpload,
    title: "Autosave that never overwrites",
    text: "Every save carries the revision it was built on; a stale one is replayed on the newer copy instead of overwriting it.",
  },
  {
    Icon: Lock,
    title: "Workspaces and roles",
    text: "Each makerspace sees only its own diagrams. Owners and editors edit; viewers open diagrams read-only.",
  },
  {
    Icon: History,
    title: "Version history",
    text: "Save versions, compare any two with added, removed and changed steps highlighted, and restore one as an undoable change.",
  },
  {
    Icon: LayoutDashboard,
    title: "Two layout engines",
    text: "dagre, and our own layered layout running in a worker, in two directions, with your manual arrangement kept for later.",
  },
  { Icon: FileDown, title: "PNG and paged PDF export", text: "Page breaks fall between steps, never through them." },
];

export function LandingPage() {
  return (
    <PublicLayout>
      <section className="hero">
        <h1>Plan the build before you pick up the saw.</h1>
        <p className="lead">
          Live Canvas is a diagram editor for a fictional network of community makerspaces. Members map out project
          build plans together, live, and share them with their workspace.
        </p>
        <Link to="/sign-in" className="button button-primary">
          Try the demo
        </Link>
      </section>
      <GuidedTour />
      <h2>Also in the demo</h2>
      <ul className="feature-list">
        {ALSO.map(({ Icon, title, text }) => (
          <li key={title}>
            <Icon size={22} aria-hidden="true" />
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </PublicLayout>
  );
}
