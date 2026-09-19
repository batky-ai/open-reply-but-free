import LegalShell from "@/components/legal-shell";

// Read at request time so a Docker image built without env still shows the operator's address.
export const dynamic = "force-dynamic";
const contact = () => process.env.CONTACT_EMAIL || "the operator of this instance";

export default function Page() { return <LegalShell title="Request data deletion" description="OpenReply" updatedAt="September 19, 2026"><section className="space-y-4"><p>Email {contact()} with the subject “Instagram data deletion.” Include your Instagram username and identify the interaction or account involved. We will verify the request and remove associated records that are no longer required.</p><p>For account owners: pause campaigns and disconnect Instagram in Settings to stop further access. Disconnecting an account does not erase messages already delivered to Instagram.</p><p>Never include passwords or access tokens in your request.</p></section></LegalShell>; }
