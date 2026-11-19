import { ChatThread } from "../components/ChatThread";
import { useDocumentTitle, useLeague, useLeagueId } from "../hooks";

export default function Chat() {
  const leagueId = useLeagueId();
  const league = useLeague(leagueId);
  useDocumentTitle(`Chat · ${league.data?.name ?? ""}`);
  // Fill the space between the sticky header and the bottom nav.
  return <ChatThread leagueId={leagueId} eventId={null} className="h-[calc(100dvh-14rem)] sm:h-[calc(100dvh-12rem)]" />;
}
