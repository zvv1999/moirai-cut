import type { Metadata } from "next";
import Link from "next/link";
import { BasePage } from "@/app/base-page";
import { Separator } from "@/components/ui/separator";
import { SOCIAL_LINKS } from "@/site/social";

export const metadata: Metadata = {
	title: "Privacy - Moirai Cut",
	description:
		"How Moirai Cut handles local media, project data and optional Agent providers.",
};

export default function PrivacyPage() {
	return (
		<BasePage
			title="Privacy"
			description="Moirai Cut is local-first. Optional Agent and hosted features can send only the context required for the feature you choose."
		>
			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Local project data</h2>
				<p>
					In the default local setup, imported media, timelines, project files,
					proxies, caches and exports remain on the device and in directories
					you control. Moirai Cut does not require an account to use the local
					editor.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Agent features</h2>
				<p>
					When you send a message to Codex, Claude or another configured
					provider, Moirai Cut sends the message plus the project references you
					selected and the minimum project context needed to complete the task.
					Director-mode or multimodal workflows may include sampled frames or
					derived media metadata.
				</p>
				<p>
					That processing is governed by the provider and account you configure.
					Review the provider&apos;s privacy, retention and training settings
					before using private or regulated media. Do not assume that an
					external model runs locally merely because the Moirai Cut editor does.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">MCP and desktop integrations</h2>
				<p>
					Installing Moirai Cut MCP gives the selected Agent application access to
					the project tools exposed by your local Moirai Cut process. Keep the
					service on a loopback address unless you have added authentication and
					intentionally secured a remote deployment.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Hosted deployments</h2>
				<p>
					A third-party or self-hosted deployment may enable accounts,
					databases, analytics, object storage or server-side model providers.
					The operator of that deployment is responsible for publishing its own
					privacy policy and disclosing the services it enables. This page
					describes the repository&apos;s default local behavior, not every
					downstream deployment.
				</p>
				<p>
					Analytics is disabled by default. A deployment loads Databuddy only
					when its operator explicitly sets the
					<code className="mx-1">NEXT_PUBLIC_DATABUDDY_CLIENT_ID</code>
					environment variable and is responsible for disclosing that
					configuration.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Logs and reports</h2>
				<p>
					Diagnostic output can contain project names, local paths, provider
					names and error details. Remove private information, task content and
					secrets before attaching logs to a public issue. Never publish API
					keys or raw private media.
				</p>
			</section>

			<Separator />

			<p className="text-muted-foreground text-sm">
				Questions or corrections can be filed in the{" "}
				<Link
					href={`${SOCIAL_LINKS.github}/issues`}
					className="text-primary hover:underline"
				>
					Moirai Cut issue tracker
				</Link>
				. Report security issues privately through the repository Security tab.
			</p>
		</BasePage>
	);
}
