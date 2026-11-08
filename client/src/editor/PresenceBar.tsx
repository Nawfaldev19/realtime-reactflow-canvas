import { useMemo, type CSSProperties } from "react";
import { useStore } from "zustand";
import type { PresenceStoreApi } from "../collab/client";
import { avatarsOf } from "../collab/presence";
import { useEditor } from "./EditorStoreContext";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

/** Everyone in the diagram: the current member first, then others in join order, one avatar per member. */
export function PresenceBar({ presence }: { presence: PresenceStoreApi }) {
  const self = useStore(presence, (state) => state.self);
  const roster = useStore(presence, (state) => state.roster);
  const doc = useEditor((state) => state.doc);
  const collaborating = useEditor((state) => state.collaborating);
  const avatars = useMemo(() => (self ? avatarsOf(roster, self) : []), [roster, self]);
  if (!collaborating || avatars.length === 0) return null;
  return (
    <ul className="presence-bar" aria-label="People in this diagram">
      {avatars.map((avatar) => {
        const number = avatar.nodeIds.map((id) => doc.nodes[id]?.number).find((value) => value !== undefined) ?? null;
        const description = [
          avatar.self ? `${avatar.name} (you)` : avatar.name,
          ...(number === null ? [] : [`editing Step ${number}`]),
          ...(avatar.sessions > 1 ? [`${avatar.sessions} tabs`] : []),
        ].join(" · ");
        return (
          <li
            key={avatar.memberId}
            className="presence-avatar"
            style={{ "--peer-color": avatar.color, "--peer-text": avatar.text } as CSSProperties}
            title={description}
            aria-label={description}
          >
            <span aria-hidden="true">{initials(avatar.name)}</span>
            {avatar.sessions > 1 && (
              <span className="presence-avatar__count" aria-hidden="true">
                {avatar.sessions}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
