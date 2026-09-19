import Link from "next/link";
export default function Guide() {
  return <main className="max-w-3xl space-y-8">
    <header><p className="text-sm text-muted">OpenReply</p><h1 className="text-3xl font-semibold">Set up a keyword reply</h1><p className="mt-3 text-muted">Choose what someone comments and the link they receive.</p></header>
    <ol className="grid gap-4 sm:grid-cols-2">
      {[
        ["1", "Check your account", "Sign in with your approved email. Open Settings and confirm your Instagram account is connected through Composio. No Meta app setup is needed."],
        ["2", "Choose a post", "Open Campaigns, create a campaign, and select the post or reel where the keyword will appear."],
        ["3", "Enter keywords", "Separate keywords with commas. For example: BOOK, READ. Start with a specific post and specific words."],
        ["4", "Write the reply", "Write the message and add your destination URL. You can also paste a short link from the Links tool."],
        ["5", "Preview and save", "Review the phone preview, then choose Save paused. Open the saved campaign and choose Activate when ready."],
        ["6", "Test and check Activity", "Comment the keyword from another Instagram account. Allow up to five minutes. Confirm one DM arrives, open its link, and check Activity. Pause the campaign to stop replies."],
      ].map(([n,title,description]) => <li key={n} className="rounded-xl border border-border bg-surface p-5"><span aria-hidden="true" className="mb-4 flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-white">{n}</span><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted">{description}</p></li>)}
    </ol>
    <div className="flex flex-wrap gap-4"><Link className="rounded bg-accent px-5 py-3 text-white" href="/campaigns/new">Create a campaign</Link><Link className="rounded border border-border px-5 py-3" href="/settings">Settings</Link></div>
    <section className="space-y-2"><h2 className="font-semibold">If a reply does not arrive</h2><p className="text-sm text-muted">Check that the campaign is active, the post and keyword match, and Instagram is connected. Read the reason in Activity before retrying. If delivery is unconfirmed, check the recipient inbox first. Check Message Requests and Spam too; Instagram may filter messages from accounts they have never contacted.</p><p className="text-sm text-muted">New campaigns start paused. Activation processes new comments only. Public replies are optional. Story/DM triggers, follow gates and follow-up messages are unavailable with this comment connection.</p></section>
  </main>;
}
