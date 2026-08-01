export const SITE_URL =
	process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const SITE_INFO = {
	title: "OneCut",
	description:
		"The agent-native video editor. Edit by intent, finish with control.",
	url: SITE_URL,
	openGraphImage: "/open-graph/default.jpg",
	twitterImage: "/open-graph/default.jpg",
	favicon: "/favicon.ico",
};

export const DEFAULT_LOGO_URL = "/logos/onecut/icon.svg";
