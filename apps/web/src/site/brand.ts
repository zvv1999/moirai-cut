export const SITE_URL =
	process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const SITE_INFO = {
	title: "Moirai Cut",
	description:
		"Moirai Cut is an open-source, local-first video editor where humans and agents create inside the same visible, editable loop.",
	url: SITE_URL,
	openGraphImage: "/open-graph/default.jpg",
	twitterImage: "/open-graph/default.jpg",
	favicon: "/favicon.ico",
};

export const DEFAULT_LOGO_URL = "/logos/moirai-cut/icon.svg";
