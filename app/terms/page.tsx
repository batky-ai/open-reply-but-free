import LegalShell from "@/components/legal-shell";

// Read at request time so a Docker image built without env still shows the operator's address.
export const dynamic = "force-dynamic";
const contact = () => process.env.CONTACT_EMAIL || "the operator of this instance";

export default function Page() { return <LegalShell title="Terms of use" description="OpenReply" updatedAt="September 19, 2026"><section className="space-y-4"><p>This private tool lets its owner manage Instagram keyword replies. Only connect accounts you are authorized to manage and activate messages you intend to send.</p><p>Use remains subject to Meta&apos;s permissions, messaging windows, and platform rules. Delivery can be delayed or fail. Check Activity before relying on a campaign.</p><p>For help, contact {contact()}.</p></section></LegalShell>; }
