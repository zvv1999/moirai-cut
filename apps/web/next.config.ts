import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";
import { withContentCollections } from "@content-collections/next";

// These routes read user project media from an external runtime directory.
// Turbopack cannot infer that boundary from the dynamic filesystem paths, so
// exclude app sources and local configuration from their standalone traces.
const externalProjectRouteExcludes = [
	"./.content-collections/**/*",
	"./.env*",
	"./.turbo/**/*",
	"./migrations/**/*",
	"./src/**/*",
	"./.gitignore",
	"./Dockerfile",
	"./bunfig.toml",
	"./components.json",
	"./content-collections.ts",
	"./drizzle.config.ts",
	"./next.config.ts",
	"./open-next.config.ts",
	"./postcss.config.mjs",
];

const nextConfig: NextConfig = {
	// The dev-tools launcher (the "N" button bottom-left) and its floating
	// popovers sit on top of the editor and read as broken UI to anyone who is
	// here to edit video rather than debug Next.
	devIndicators: false,
	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},
	reactStrictMode: true,
	productionBrowserSourceMaps: true,
	output: "standalone",
	outputFileTracingExcludes: {
		"/api/media/**": externalProjectRouteExcludes,
		"/api/media-jobs/**": externalProjectRouteExcludes,
		"/api/native-delivery/**": externalProjectRouteExcludes,
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "plus.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.marblecms.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "api.iconify.design",
			},
			{
				protocol: "https",
				hostname: "api.simplesvg.com",
			},
			{
				protocol: "https",
				hostname: "api.unisvg.com",
			},
			{
				protocol: "https",
				hostname: "cdn.brandfetch.io",
			},
		],
	},
};

export default withContentCollections(withBotId(nextConfig));
