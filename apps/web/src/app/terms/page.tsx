import type { Metadata } from "next";
import Link from "next/link";
import { BasePage } from "@/app/base-page";
import { Separator } from "@/components/ui/separator";
import { SOCIAL_LINKS } from "@/site/social";

export const metadata: Metadata = {
	title: "Terms - Moirai Cut",
	description:
		"Plain-language terms for the Moirai Cut open-source software and project website.",
};

export default function TermsPage() {
	return (
		<BasePage
			title="Terms"
			description="These plain-language terms cover this project website. The software license remains the source of truth for the code."
		>
			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Open-source software</h2>
				<p>
					Moirai Cut source code is provided under the repository&apos;s MIT
					License. You may use, modify and distribute the software subject to
					that license and its copyright notice. The software is provided
					&quot;as is&quot;, without warranty of any kind.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Your content</h2>
				<p>
					Moirai Cut does not claim ownership of videos, audio, images, projects or
					exports you create. You are responsible for having the rights needed
					to use, transform and distribute that content and for complying with
					applicable law.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">External services</h2>
				<p>
					Agent providers, model APIs, cloud storage, authentication, analytics
					and other optional integrations are third-party services. Their own
					terms, pricing and usage policies apply. Moirai Cut does not grant rights
					to those services or guarantee their availability.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Safe use</h2>
				<p>
					Do not use Moirai Cut to infringe rights, distribute unlawful content,
					bypass access controls, attack systems or expose data you are not
					authorized to process. Review Agent plans before applying them and
					keep backups of important projects.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">
					Brand and upstream attribution
				</h2>
				<p>
					Moirai Cut is an independent fork of OpenCut Classic and is not affiliated
					with or endorsed by the upstream project. The Moirai Cut name and original
					marks identify this project; they are separate from the MIT license
					for the source code. See the repository notice and brand guide for
					details.
				</p>
			</section>

			<Separator />

			<p className="text-muted-foreground text-sm">
				Questions and documentation corrections can be filed in the{" "}
				<Link
					href={`${SOCIAL_LINKS.github}/issues`}
					className="text-primary hover:underline"
				>
					Moirai Cut issue tracker
				</Link>
				. Downstream hosted services should publish their own legally reviewed
				terms.
			</p>
		</BasePage>
	);
}
