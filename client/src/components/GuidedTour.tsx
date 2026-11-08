import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { TOUR } from "../pages/tour";

/** A short stepper through the hero features, with where to try each one. */
export function GuidedTour() {
  const [index, setIndex] = useState(0);
  const stop = TOUR[index] ?? TOUR[0];
  if (!stop) return null;
  const last = index === TOUR.length - 1;

  return (
    <section className="tour card" aria-labelledby="tour-heading">
      <h2 id="tour-heading">Take the tour</h2>
      <ol className="tour-stops" aria-label="Tour stops">
        {TOUR.map((item, position) => (
          <li key={item.id}>
            <button
              type="button"
              className="tour-stop"
              aria-current={position === index ? "step" : undefined}
              aria-label={`${String(position + 1)}. ${item.title}`}
              onClick={() => setIndex(position)}
            >
              {position + 1}
            </button>
          </li>
        ))}
      </ol>
      <div className="tour-panel" aria-live="polite">
        <p className="tour-count">
          Stop {index + 1} of {TOUR.length}
        </p>
        <h3>{stop.title}</h3>
        <p>{stop.summary}</p>
        <h4>Try it</h4>
        <ol>
          {stop.tryIt.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </div>
      <div className="tour-actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          <ArrowLeft size={16} aria-hidden="true" /> Back
        </button>
        {last ? (
          <Link to="/sign-in" className="button button-primary">
            Start trying it
          </Link>
        ) : (
          <button type="button" className="button button-primary" onClick={() => setIndex(index + 1)}>
            Next <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
