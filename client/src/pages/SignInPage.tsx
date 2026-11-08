import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApolloClient, useMutation, useQuery } from "@apollo/client";
import { LoadingCards, ErrorState } from "../components/States";
import { PublicLayout } from "../components/PublicLayout";
import { DEMO_MEMBERS, SIGN_IN_AS_DEMO } from "../graphql/operations";
import { describeError } from "../lib/errors";
import { useSession } from "../lib/session";

/** Demo sign-in: pick a person. The server returns a signed, expiring token. */
export function SignInPage() {
  const { data, error, refetch } = useQuery(DEMO_MEMBERS);
  const [signInMutation, { loading }] = useMutation(SIGN_IN_AS_DEMO);
  const [message, setMessage] = useState<string | null>(null);
  const { signIn } = useSession();
  const client = useApolloClient();
  const navigate = useNavigate();

  const choose = async (memberId: string) => {
    setMessage(null);
    try {
      const { data: result } = await signInMutation({ variables: { memberId } });
      const payload = result?.signInAsDemo;
      if (!payload?.token) {
        setMessage(payload?.errors[0]?.message ?? "Sign-in failed");
        return;
      }
      await client.clearStore();
      signIn(payload.token);
      void navigate("/app");
    } catch (failure) {
      setMessage(describeError(failure));
    }
  };

  return (
    <PublicLayout>
      <div className="page-header">
        <div>
          <h1>Choose a person</h1>
          <p>
            Each demo member has a different role in the two makerspaces, so you can see what owners, editors and
            viewers get.
          </p>
        </div>
      </div>
      {message && (
        <p className="alert alert-error" role="alert">
          {message}
        </p>
      )}
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}
      {!data && !error && <LoadingCards count={5} label="Loading demo members" />}
      {data && (
        <ul className="person-grid">
          {data.demoMembers.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                className="person-card card"
                disabled={loading}
                onClick={() => void choose(member.id)}
              >
                <span className="avatar avatar-lg" aria-hidden="true">
                  {member.initials}
                </span>
                <span className="person-card__name">Continue as {member.name}</span>
                <span className="meta">{member.summary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </PublicLayout>
  );
}
