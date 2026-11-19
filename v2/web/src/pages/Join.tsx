import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { api } from "../api";
import { Logo } from "../components/Brand";
import { Button, Card, ErrorNote, Spinner } from "../components/ui";
import { useMe } from "../hooks";
import { SignInOptions } from "./Login";

/** Invite landing page: shows the league, signs you in if needed, then joins in one tap. */
export default function Join() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me, isLoading } = useMe();
  const invite = useQuery({ queryKey: ["invite", code], queryFn: () => api.invite(code) });
  const join = useMutation({
    mutationFn: () => api.joinLeague(code),
    onSuccess: ({ league }) => {
      void qc.invalidateQueries({ queryKey: ["leagues"] });
      navigate(`/l/${league.id}`, { replace: true });
    },
  });

  if (isLoading || invite.isLoading) return <Spinner className="pt-32" />;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-brand-50 to-slate-100 px-4">
      <Card className="w-full max-w-sm space-y-5 p-6 text-center">
        <div className="flex justify-center"><Logo size={48} /></div>
        {invite.error ? (
          <>
            <ErrorNote error={invite.error} />
            <Button variant="secondary" onClick={() => navigate("/")}>Go home</Button>
          </>
        ) : (
          <>
            <div>
              <p className="text-sm text-slate-500">You're invited to join</p>
              <h1 className="text-2xl font-black">{invite.data!.name}</h1>
              {invite.data!.description && <p className="mt-1 text-sm text-slate-600">{invite.data!.description}</p>}
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                <Users size={14} /> {invite.data!.memberCount} {invite.data!.memberCount === 1 ? "dad" : "dads"} so far
              </p>
            </div>
            {me ? (
              <>
                <ErrorNote error={join.error} />
                <Button className="w-full" loading={join.isPending} onClick={() => join.mutate()}>
                  Join as {me.name}
                </Button>
              </>
            ) : (
              <div className="text-left">
                <SignInOptions returnTo={`/join/${code}`} onDevLogin={() => qc.invalidateQueries({ queryKey: ["me"] })} />
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
