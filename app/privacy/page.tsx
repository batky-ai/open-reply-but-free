import LegalShell from "@/components/legal-shell";

// Read at request time so a Docker image built without env still shows the operator's address.
export const dynamic = "force-dynamic";
const contact = () => process.env.CONTACT_EMAIL || "the operator of this instance";

export default function Page() { return <LegalShell title="Privacy policy" description="OpenReply" updatedAt="September 19, 2026"><section className="space-y-4"><h2>Information used by this service</h2><p>OpenReply stores the approved owner email address, Instagram account details, encrypted connection credentials, campaign settings, relevant comments and messages, delivery logs, and tracked-link clicks. These records support sign-in, keyword replies, duplicate prevention, and troubleshooting.</p><h2>Service providers</h2><p>Meta processes Instagram messages. Composio maintains the authorized Instagram connection and routes requests for posts, comments, and replies. Resend delivers sign-in emails. The operator of this instance runs the application and its database. Access is limited to the account owner.</p><h2>Your choices</h2><p>Contact {contact()} to ask about your information or request deletion. Include your Instagram username and enough context to locate the records. Do not send passwords or access tokens.</p></section></LegalShell>; }
